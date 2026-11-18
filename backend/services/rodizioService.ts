import crypto from 'node:crypto';
import type {
  AdminBarber,
  ApiOk,
  AttendanceRow,
  AuditRow,
  BarberState,
  BarberSummaryRow,
  BarberView,
  Mode,
  OperationName,
  OperationSummary,
  StateSnapshot,
  UndoInfo,
} from '../../shared/types.js';
import { backupTo, transaction, type Db } from '../database/connection.js';
import { migrateOperational } from '../database/schema.js';
import { AppError } from '../domain/errors.js';
import { deriveState, kindForPosition, shiftDateOf } from '../domain/rules.js';
import { AttendanceRepository, type HistoryFilter } from '../repositories/attendanceRepository.js';
import { AuditRepository } from '../repositories/auditRepository.js';
import { BarberRepository, type BarberInput, type BarberRow } from '../repositories/barberRepository.js';
import { QueueRepository } from '../repositories/queueRepository.js';
import { ShiftRepository, type ShiftRow } from '../repositories/shiftRepository.js';

export interface RodizioSettings {
  shopName: string;
  logoUrl: string | null;
  undoWindowSeconds: number;
}

export interface ServiceDeps {
  mode: Mode;
  settings: () => RodizioSettings;
  clock?: () => number;
  /** Chamado após cada alteração confirmada no banco. */
  onChange?: () => void;
}

interface Outcome {
  operation: OperationName | string;
  barberId: number | null;
  info: Record<string, unknown>;
  undoable: boolean;
  extra?: Partial<OperationSummary>;
}

interface ExecOptions {
  actor: string;
  opId?: string;
}

/**
 * Regras de negócio do rodízio. TODAS as alterações da fila passam por aqui,
 * dentro de transações, com registro de auditoria e incremento de versão.
 */
export class RodizioService {
  readonly barbers: BarberRepository;
  readonly shifts: ShiftRepository;
  readonly queue: QueueRepository;
  readonly attendances: AttendanceRepository;
  readonly audit: AuditRepository;
  readonly mode: Mode;
  private readonly clock: () => number;

  constructor(
    readonly db: Db,
    private deps: ServiceDeps,
  ) {
    migrateOperational(db);
    this.mode = deps.mode;
    this.clock = deps.clock ?? Date.now;
    this.barbers = new BarberRepository(db);
    this.shifts = new ShiftRepository(db);
    this.queue = new QueueRepository(db);
    this.attendances = new AttendanceRepository(db);
    this.audit = new AuditRepository(db);
    if (!this.audit.getMeta('epoch')) {
      this.audit.setMeta('epoch', crypto.randomBytes(4).toString('hex'));
      this.audit.setMeta('version', '1');
    }
  }

  now(): number {
    return this.clock();
  }

  /* ======================================================================
   * Recuperação e manutenção
   * ==================================================================== */

  /** Verifica a integridade do banco e corrige inconsistências deixadas por uma parada inesperada. */
  recover(): { integrity: string; fixes: string[] } {
    const check = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const fixes: string[] = [];
    transaction(this.db, () => {
      const now = this.now();
      // Fila de espera de profissional que está em atendimento.
      const r1 = this.db
        .prepare(
          `UPDATE queue_entries SET state = 'VOIDED', exit_reason = 'RECOVERY', left_at = ?
            WHERE state = 'WAITING' AND barber_id IN (SELECT barber_id FROM attendances WHERE status = 'IN_PROGRESS')`,
        )
        .run(now);
      if (r1.changes) fixes.push(`${r1.changes} entrada(s) de fila duplicada(s) em atendimento`);
      // Fila de espera em turno fechado.
      const r2 = this.db
        .prepare(
          `UPDATE queue_entries SET state = 'REMOVED', exit_reason = 'RECOVERY', left_at = ?
            WHERE state = 'WAITING' AND shift_id IN (SELECT id FROM shifts WHERE status = 'CLOSED')`,
        )
        .run(now);
      if (r2.changes) fixes.push(`${r2.changes} entrada(s) de fila em turno encerrado`);
      // Atendimentos em andamento em turno fechado.
      const stale = this.db
        .prepare(
          `SELECT a.* FROM attendances a JOIN shifts s ON s.id = a.shift_id
            WHERE a.status = 'IN_PROGRESS' AND s.status = 'CLOSED'`,
        )
        .all() as unknown as { id: number; started_at: number }[];
      for (const a of stale) {
        this.attendances.finish(a.id, 'CLOSED_BY_SHIFT', now, Math.max(0, Math.round((now - a.started_at) / 1000)));
      }
      if (stale.length) fixes.push(`${stale.length} atendimento(s) em turno encerrado`);
      // Profissionais inativos na fila.
      const r3 = this.db
        .prepare(
          `UPDATE queue_entries SET state = 'REMOVED', exit_reason = 'RECOVERY', left_at = ?
            WHERE state = 'WAITING' AND barber_id IN (SELECT id FROM barbers WHERE active = 0)`,
        )
        .run(now);
      if (r3.changes) fixes.push(`${r3.changes} profissional(is) inativo(s) na fila`);
      if (fixes.length) {
        this.audit.add({
          operation: 'RECOVERY',
          actor: 'sistema',
          now,
          shiftId: null,
          barberId: null,
          info: { fixes },
        });
        this.audit.bumpVersion();
      }
    });
    this.maintain();
    return { integrity: check.integrity_check, fixes };
  }

  /**
   * Garante o turno correto: encerra turno de dia anterior e abre automaticamente o turno de hoje
   * (exceto se a recepção já encerrou manualmente o turno de hoje).
   */
  maintain(): boolean {
    const now = this.now();
    const today = shiftDateOf(now);
    const open = this.shifts.getOpen();
    const needsRollover = !!open && open.date !== today;
    const needsOpen = (!open || needsRollover) && this.shifts.countForDate(today) === 0;
    if (!needsRollover && !needsOpen) return false;
    transaction(this.db, () => {
      let current = this.shifts.getOpen();
      if (current && current.date !== today) {
        this.closeShiftInternal(current, 'AUTO_ROLLOVER', 'sistema', now);
        current = undefined;
      }
      if (!current && this.shifts.countForDate(today) === 0) {
        const id = this.shifts.open(today, now);
        this.audit.add({ operation: 'SHIFT_OPEN', actor: 'sistema', now, shiftId: id, barberId: null, info: { auto: true } });
      }
      this.audit.bumpVersion();
    });
    this.deps.onChange?.();
    return true;
  }

  /** Encerra a instância de demonstração: nenhuma ação desfazível após o povoamento inicial. */
  seal(): void {
    transaction(this.db, () => {
      this.db.prepare('UPDATE audit_logs SET undoable = 0').run();
      this.audit.bumpVersion();
    });
  }

  /* ======================================================================
   * Execução padronizada de operações
   * ==================================================================== */

  private execute(opts: ExecOptions, fn: (now: number) => Outcome): ApiOk {
    this.maintain();

    if (opts.opId) {
      const cached = this.audit.findProcessed(opts.opId);
      if (cached) {
        const result = { ...(JSON.parse(cached) as OperationSummary), duplicate: true };
        return { ok: true, snapshot: this.snapshot(), result };
      }
    }

    const summary = transaction(this.db, () => {
      const now = this.now();
      const out = fn(now);
      const shift = this.shifts.getOpen();
      const auditId = this.audit.add({
        operation: out.operation,
        actor: opts.actor,
        now,
        shiftId: shift?.id ?? null,
        barberId: out.barberId,
        info: out.info,
        undoable: out.undoable,
      });
      this.audit.bumpVersion();
      const barber = out.barberId ? this.barbers.get(out.barberId) : undefined;
      const result: OperationSummary = {
        operation: out.operation as OperationName,
        auditId,
        barberId: out.barberId,
        barberName: barber?.display_name ?? null,
        ...out.extra,
      };
      if (opts.opId) this.audit.saveProcessed(opts.opId, result, now);
      return result;
    });

    this.deps.onChange?.();
    return { ok: true, snapshot: this.snapshot(), result: summary };
  }

  private requireOpenShift(): ShiftRow {
    const shift = this.shifts.getOpen();
    if (!shift) throw new AppError('SHIFT_CLOSED');
    return shift;
  }

  private requireBarber(id: number): BarberRow {
    const b = this.barbers.get(id);
    if (!b) throw new AppError('BARBER_NOT_FOUND');
    return b;
  }

  stateOf(b: BarberRow): BarberState {
    return deriveState({
      hasActiveAttendance: !!this.attendances.activeFor(b.id),
      isWaiting: !!this.queue.waitingFor(b.id),
      restState: b.rest_state,
    });
  }

  /* ======================================================================
   * Operações do rodízio
   * ==================================================================== */

  /** ESTOU DISPONÍVEL / retorno de pausa: insere o profissional no FINAL da fila. */
  enter(barberId: number, opts: ExecOptions): ApiOk {
    return this.execute(opts, (now) => this.doEnter(barberId, now, false));
  }

  resume(barberId: number, opts: ExecOptions): ApiOk {
    return this.execute(opts, (now) => this.doEnter(barberId, now, true));
  }

  private doEnter(barberId: number, now: number, requirePaused: boolean): Outcome {
    const shift = this.requireOpenShift();
    const b = this.requireBarber(barberId);
    if (!b.active) throw new AppError('BARBER_INACTIVE');
    const state = this.stateOf(b);
    if (state === 'TRABALHANDO') throw new AppError('ALREADY_WORKING');
    if (state === 'APTO') throw new AppError('ALREADY_IN_QUEUE');
    if (requirePaused && state !== 'PAUSA') throw new AppError('NOT_PAUSED');
    const entryId = this.queue.pushBack(b.id, shift.id, now);
    const entry = this.queue.get(entryId)!;
    this.barbers.setRestState(b.id, 'OFF', now);
    const position = this.queue.positionOf(entry);
    return {
      operation: state === 'PAUSA' ? 'RESUME' : 'ENTER',
      barberId: b.id,
      info: { prevRest: b.rest_state, entryId, position },
      undoable: true,
      extra: { position },
    };
  }

  /** Inicia atendimento do profissional indicado (rodízio se for o 1º; escolha específica nos demais). */
  start(barberId: number, opts: ExecOptions): ApiOk {
    return this.execute(opts, (now) => this.doStart(barberId, now, opts.actor));
  }

  /** Direciona o próximo cliente ao primeiro da fila. */
  startNext(opts: ExecOptions): ApiOk {
    return this.execute(opts, (now) => {
      const shift = this.requireOpenShift();
      const first = this.queue.waiting(shift.id)[0];
      if (!first) throw new AppError('NO_BARBERS_AVAILABLE');
      return this.doStart(first.barber_id, now, opts.actor);
    });
  }

  private doStart(barberId: number, now: number, actor: string): Outcome {
    const shift = this.requireOpenShift();
    const b = this.requireBarber(barberId);
    if (!b.active) throw new AppError('BARBER_INACTIVE');
    const state = this.stateOf(b);
    if (state === 'TRABALHANDO') throw new AppError('ALREADY_WORKING');
    if (state === 'PAUSA') throw new AppError('IS_PAUSED');
    if (state === 'FORA') throw new AppError('IS_OFF');
    const entry = this.queue.waitingFor(b.id)!;
    const position = this.queue.positionOf(entry);
    const kind = kindForPosition(position);
    this.queue.leave(entry.id, 'SERVED', 'START', now);
    const attendanceId = this.attendances.start(b.id, shift.id, kind, position, now, actor);
    return {
      operation: 'START',
      barberId: b.id,
      info: { entryId: entry.id, attendanceId, kind, position },
      undoable: true,
      extra: { kind, position },
    };
  }

  /** Finaliza o atendimento e devolve o profissional ao FINAL da fila. */
  finish(barberId: number, opts: ExecOptions & { attendanceId?: number }): ApiOk {
    return this.execute(opts, (now) => {
      const b = this.requireBarber(barberId);
      const att = this.attendances.activeFor(b.id);
      if (!att) throw new AppError('NOT_WORKING');
      if (opts.attendanceId !== undefined && opts.attendanceId !== att.id) throw new AppError('STALE_STATE');
      const shift = this.requireOpenShift();
      const duration = Math.max(0, Math.round((now - att.started_at) / 1000));
      this.attendances.finish(att.id, 'FINISHED', now, duration);
      let newEntryId: number | null = null;
      let position: number | undefined;
      if (b.active) {
        newEntryId = this.queue.pushBack(b.id, shift.id, now);
        position = this.queue.positionOf(this.queue.get(newEntryId)!);
      } else {
        this.barbers.setRestState(b.id, 'OFF', now);
      }
      return {
        operation: 'FINISH',
        barberId: b.id,
        info: { attendanceId: att.id, newEntryId, durationSeconds: duration },
        undoable: true,
        extra: { durationSeconds: duration, position },
      };
    });
  }

  /** Pausa: sai da fila; ao voltar entra no final. */
  pause(barberId: number, opts: ExecOptions): ApiOk {
    return this.execute(opts, (now) => {
      this.requireOpenShift();
      const b = this.requireBarber(barberId);
      const state = this.stateOf(b);
      if (state === 'TRABALHANDO') throw new AppError('FINISH_BEFORE_PAUSE');
      if (state === 'PAUSA') throw new AppError('IS_PAUSED');
      if (state === 'FORA') throw new AppError('IS_OFF');
      const entry = this.queue.waitingFor(b.id)!;
      this.queue.leave(entry.id, 'REMOVED', 'PAUSE', now);
      this.barbers.setRestState(b.id, 'PAUSED', now);
      return {
        operation: 'PAUSE',
        barberId: b.id,
        info: { entryId: entry.id, prevRest: b.rest_state },
        undoable: true,
      };
    });
  }

  /** Encerra o expediente do profissional (FORA DO EXPEDIENTE). */
  clockOut(barberId: number, opts: ExecOptions): ApiOk {
    return this.execute(opts, (now) => {
      this.requireOpenShift();
      const b = this.requireBarber(barberId);
      const state = this.stateOf(b);
      if (state === 'TRABALHANDO') throw new AppError('FINISH_BEFORE_PAUSE');
      if (state === 'FORA') throw new AppError('IS_OFF');
      let entryId: number | null = null;
      if (state === 'APTO') {
        const entry = this.queue.waitingFor(b.id)!;
        entryId = entry.id;
        this.queue.leave(entry.id, 'REMOVED', 'CLOCK_OUT', now);
      }
      this.barbers.setRestState(b.id, 'OFF', now);
      return {
        operation: 'CLOCK_OUT',
        barberId: b.id,
        info: { prevState: state, entryId, prevRest: b.rest_state },
        undoable: true,
      };
    });
  }

  /**
   * Desfaz SOMENTE a última alteração, dentro da janela de tempo e se nenhuma outra
   * alteração válida a sucedeu. Restaura inclusive a posição original na fila.
   */
  undo(auditId: number, opts: ExecOptions): ApiOk {
    return this.execute({ ...opts, opId: opts.opId }, (now) => {
      const row = this.audit.get(auditId);
      if (!row || !row.undoable || row.undone_at) throw new AppError('UNDO_NOT_FOUND');
      const windowMs = this.deps.settings().undoWindowSeconds * 1000;
      if (now - row.created_at > windowMs) throw new AppError('UNDO_EXPIRED');
      const shift = this.shifts.getOpen();
      if (!shift || row.shift_id !== shift.id) throw new AppError('UNDO_BLOCKED');
      if (this.audit.hasLaterChanges(row.id)) throw new AppError('UNDO_BLOCKED');
      const info = JSON.parse(row.info ?? '{}') as Record<string, number | string | null>;
      const barber = row.barber_id ? this.barbers.get(row.barber_id) : undefined;
      if (!barber) throw new AppError('UNDO_BLOCKED');
      const prevRest = (info.prevRest as 'OFF' | 'PAUSED' | undefined) ?? 'OFF';
      const blocked = () => new AppError('UNDO_BLOCKED');

      switch (row.operation) {
        case 'ENTER':
        case 'RESUME': {
          const entry = this.queue.get(Number(info.entryId));
          if (!entry || entry.state !== 'WAITING') throw blocked();
          this.queue.leave(entry.id, 'VOIDED', 'UNDO', now);
          this.barbers.setRestState(barber.id, prevRest, now);
          break;
        }
        case 'START': {
          const att = this.attendances.get(Number(info.attendanceId));
          const entry = this.queue.get(Number(info.entryId));
          if (!att || att.status !== 'IN_PROGRESS' || !entry || entry.state !== 'SERVED') throw blocked();
          this.attendances.cancel(att.id, now);
          this.queue.restore(entry.id);
          break;
        }
        case 'FINISH': {
          const att = this.attendances.get(Number(info.attendanceId));
          if (!att || att.status !== 'FINISHED') throw blocked();
          if (info.newEntryId !== null && info.newEntryId !== undefined) {
            const entry = this.queue.get(Number(info.newEntryId));
            if (!entry || entry.state !== 'WAITING') throw blocked();
            this.queue.leave(entry.id, 'VOIDED', 'UNDO', now);
          }
          this.attendances.reopen(att.id);
          break;
        }
        case 'PAUSE': {
          const entry = this.queue.get(Number(info.entryId));
          if (!entry || entry.state !== 'REMOVED') throw blocked();
          this.queue.restore(entry.id);
          this.barbers.setRestState(barber.id, prevRest, now);
          break;
        }
        case 'CLOCK_OUT': {
          if (info.prevState === 'APTO') {
            const entry = this.queue.get(Number(info.entryId));
            if (!entry || entry.state !== 'REMOVED') throw blocked();
            this.queue.restore(entry.id);
          } else {
            this.barbers.setRestState(barber.id, 'PAUSED', now);
          }
          break;
        }
        default:
          throw blocked();
      }
      this.audit.markUndone(row.id, now);
      return {
        operation: 'UNDO',
        barberId: barber.id,
        info: { target: row.id, targetOperation: row.operation },
        undoable: false,
        extra: { operation: row.operation as OperationName },
      };
    });
  }

  /* ======================================================================
   * Turnos
   * ==================================================================== */

  openShift(actor: string): ApiOk {
    return this.execute({ actor }, (now) => {
      if (this.shifts.getOpen()) throw new AppError('SHIFT_ALREADY_OPEN');
      const id = this.shifts.open(shiftDateOf(now), now);
      return { operation: 'SHIFT_OPEN', barberId: null, info: { shiftId: id }, undoable: false };
    });
  }

  closeShift(actor: string): ApiOk {
    return this.execute({ actor }, (now) => {
      const shift = this.shifts.getOpen();
      if (!shift) throw new AppError('NO_OPEN_SHIFT');
      this.closeShiftInternal(shift, 'MANUAL', actor, now);
      return { operation: 'SHIFT_CLOSE', barberId: null, info: { shiftId: shift.id }, undoable: false };
    });
  }

  private closeShiftInternal(shift: ShiftRow, reason: string, actor: string, now: number): void {
    const active = this.db
      .prepare("SELECT id, started_at FROM attendances WHERE shift_id = ? AND status = 'IN_PROGRESS'")
      .all(shift.id) as unknown as { id: number; started_at: number }[];
    for (const a of active) {
      this.attendances.finish(a.id, 'CLOSED_BY_SHIFT', now, Math.max(0, Math.round((now - a.started_at) / 1000)));
    }
    this.queue.removeAllWaiting(shift.id, 'SHIFT_CLOSED', now);
    this.barbers.resetAllRest(now);
    this.shifts.close(shift.id, now, reason);
    if (reason !== 'MANUAL') {
      this.audit.add({
        operation: 'SHIFT_CLOSE',
        actor,
        now,
        shiftId: shift.id,
        barberId: null,
        info: { reason, closedAttendances: active.length },
      });
    }
  }

  /* ======================================================================
   * Cadastro de barbeiros (administração)
   * ==================================================================== */

  createBarber(input: BarberInput, actor: string): { id: number; ok: ApiOk } {
    let id = 0;
    const ok = this.execute({ actor }, (now) => {
      id = this.barbers.insert(input, now);
      return { operation: 'BARBER_CREATE', barberId: id, info: { name: input.displayName }, undoable: false };
    });
    return { id, ok };
  }

  updateBarber(id: number, input: BarberInput, actor: string): ApiOk {
    return this.execute({ actor }, (now) => {
      this.requireBarber(id);
      this.barbers.update(id, input, now);
      return { operation: 'BARBER_UPDATE', barberId: id, info: { name: input.displayName }, undoable: false };
    });
  }

  setBarberPhoto(id: number, photo: string | null, actor: string): ApiOk {
    return this.execute({ actor }, (now) => {
      this.requireBarber(id);
      this.barbers.setPhoto(id, photo, now);
      return { operation: 'BARBER_PHOTO', barberId: id, info: {}, undoable: false };
    });
  }

  /** Desativar NÃO apaga histórico: apenas remove o profissional da operação. */
  setBarberActive(id: number, active: boolean, actor: string): ApiOk {
    return this.execute({ actor }, (now) => {
      const b = this.requireBarber(id);
      if (!active) {
        const state = this.stateOf(b);
        if (state === 'TRABALHANDO') throw new AppError('FINISH_BEFORE_PAUSE');
        const entry = this.queue.waitingFor(id);
        if (entry) this.queue.leave(entry.id, 'REMOVED', 'DEACTIVATED', now);
        this.barbers.setRestState(id, 'OFF', now);
      }
      this.barbers.setActive(id, active, now);
      return {
        operation: active ? 'BARBER_ACTIVATE' : 'BARBER_DEACTIVATE',
        barberId: id,
        info: {},
        undoable: false,
      };
    });
  }

  /** Notifica clientes quando configurações (nome, logotipo) mudam. */
  touch(actor: string, operation = 'SETTINGS_UPDATE'): void {
    transaction(this.db, () => {
      this.audit.add({ operation, actor, now: this.now(), shiftId: null, barberId: null });
      this.audit.bumpVersion();
    });
    this.deps.onChange?.();
  }

  /* ======================================================================
   * Consultas
   * ==================================================================== */

  snapshot(): StateSnapshot {
    const now = this.now();
    const shift = this.shifts.getOpen();
    const today = shiftDateOf(now);
    const waiting = shift ? this.queue.waiting(shift.id) : [];
    const position = new Map<number, { pos: number; enteredAt: number }>();
    waiting.forEach((e, i) => position.set(e.barber_id, { pos: i + 1, enteredAt: e.entered_at }));
    const active = new Map(this.attendances.allActive().map((a) => [a.barber_id, a]));

    const views: BarberView[] = this.barbers.list(true).map((b) => {
      const att = active.get(b.id);
      const pos = position.get(b.id);
      const state = deriveState({ hasActiveAttendance: !!att, isWaiting: !!pos, restState: b.rest_state });
      return {
        id: b.id,
        fullName: b.full_name,
        displayName: b.display_name,
        photoUrl: b.photo,
        color: b.color,
        state,
        position: state === 'APTO' && pos ? pos.pos : null,
        queueEnteredAt: state === 'APTO' && pos ? pos.enteredAt : null,
        attendance: att
          ? { id: att.id, kind: att.kind, startedAt: att.started_at, queuePosition: att.queue_position }
          : null,
      };
    });
    const order: Record<BarberState, number> = { APTO: 0, TRABALHANDO: 1, PAUSA: 2, FORA: 3 };
    views.sort((a, b) => {
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      if (a.state === 'APTO') return (a.position ?? 0) - (b.position ?? 0);
      if (a.state === 'TRABALHANDO') return (a.attendance?.startedAt ?? 0) - (b.attendance?.startedAt ?? 0);
      return a.displayName.localeCompare(b.displayName, 'pt-BR');
    });

    const shiftStats = shift ? this.attendances.shiftStats(shift.id) : { completed: 0, avg: null };
    const working = views.filter((v) => v.state === 'TRABALHANDO');
    const longest = working.length
      ? Math.max(...working.map((w) => Math.round((now - (w.attendance?.startedAt ?? now)) / 1000)))
      : null;
    const settings = this.deps.settings();

    return {
      stream: `${this.mode}:${this.audit.getMeta('epoch')}`,
      version: Number(this.audit.getMeta('version') ?? '0'),
      serverTime: now,
      mode: this.mode,
      shop: { name: settings.shopName, logoUrl: settings.logoUrl },
      shift: shift ? { id: shift.id, date: shift.date, openedAt: shift.opened_at, status: 'OPEN' } : null,
      shiftClosedToday: !shift && this.shifts.countForDate(today) > 0,
      barbers: views,
      stats: {
        waiting: views.filter((v) => v.state === 'APTO').length,
        working: working.length,
        resting: views.filter((v) => v.state === 'PAUSA' || v.state === 'FORA').length,
        activeBarbers: views.filter((v) => v.state !== 'FORA').length,
        completedToday: shiftStats.completed,
        avgDurationSeconds: shiftStats.avg,
        longestRunningSeconds: longest,
      },
      undo: this.undoInfo(now, shift),
    };
  }

  private undoInfo(now: number, shift: ShiftRow | undefined): UndoInfo | null {
    if (!shift) return null;
    const latest = this.audit.latestUndoable();
    if (!latest || latest.shift_id !== shift.id) return null;
    const expiresAt = latest.created_at + this.deps.settings().undoWindowSeconds * 1000;
    if (now > expiresAt) return null;
    if (this.audit.hasLaterChanges(latest.id)) return null;
    const barber = latest.barber_id ? this.barbers.get(latest.barber_id) : undefined;
    return {
      auditId: latest.id,
      operation: latest.operation as OperationName,
      barberName: barber?.display_name ?? '',
      expiresAt,
    };
  }

  adminBarbers(): AdminBarber[] {
    const counts = this.attendances.countByBarber();
    return this.barbers.list(false).map((b) => ({
      id: b.id,
      fullName: b.full_name,
      displayName: b.display_name,
      photoUrl: b.photo,
      color: b.color,
      active: !!b.active,
      state: b.active ? this.stateOf(b) : 'INATIVO',
      totalAttendances: counts.get(b.id) ?? 0,
      createdAt: b.created_at,
    }));
  }

  history(filter: HistoryFilter): { rows: AttendanceRow[]; total: number } {
    const { rows, total } = this.attendances.history(filter);
    return {
      total,
      rows: rows.map((r) => ({
        id: r.id as number,
        barberId: r.barber_id as number,
        barberName: r.barber_name as string,
        shiftId: r.shift_id as number,
        shiftDate: r.shift_date as string,
        kind: r.kind as AttendanceRow['kind'],
        queuePosition: (r.queue_position as number | null) ?? null,
        startedAt: r.started_at as number,
        endedAt: (r.ended_at as number | null) ?? null,
        durationSeconds: (r.duration_seconds as number | null) ?? null,
        status: r.status as AttendanceRow['status'],
        source: (r.source as string | null) ?? null,
      })),
    };
  }

  summary(filter: Pick<HistoryFilter, 'from' | 'to' | 'barberId'>): BarberSummaryRow[] {
    return this.attendances.summary(filter).map((r) => ({
      barberId: r.barber_id as number,
      barberName: r.barber_name as string,
      finished: Number(r.finished),
      rotation: Number(r.rotation),
      specific: Number(r.specific),
      avgDurationSeconds: r.avg_seconds === null ? null : Math.round(Number(r.avg_seconds)),
      totalSeconds: Number(r.total_seconds),
    }));
  }

  auditLog(limit: number, offset: number): { rows: AuditRow[]; total: number } {
    const { rows, total } = this.audit.list(limit, offset);
    return {
      total,
      rows: rows.map((r) => ({
        id: r.id as number,
        operation: r.operation as string,
        actor: r.actor as string,
        createdAt: r.created_at as number,
        barberId: (r.barber_id as number | null) ?? null,
        barberName: (r.barber_name as string | null) ?? null,
        info: r.info ? (JSON.parse(r.info as string) as Record<string, unknown>) : null,
        undone: r.undone_at !== null,
      })),
    };
  }

  backupTo(file: string): void {
    backupTo(this.db, file);
  }
}

