import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ActiveAttendance,
  AdminBarber,
  ApiOk,
  AttendanceKind,
  AttendanceRow,
  AuditRow,
  BarberState,
  BarberSummaryRow,
  BarberView,
  OperationName,
  StateSnapshot,
  UndoInfo,
} from '../../shared/types.js';
import type { AppConfig } from '../config.js';
import { AppError } from '../domain/errors.js';
import { deriveState, shiftDateOf } from '../domain/rules.js';

interface ExecOpts {
  actor: string;
  opId?: string;
  attendanceId?: number;
}

export class SupabaseRodizioService {
  readonly mode: 'real' = 'real';
  private client: SupabaseClient;

  constructor(config: AppConfig, private onChange?: () => void) {
    this.client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private now(): number {
    return Date.now();
  }

  async recover(): Promise<{ integrity: string; fixes: string[] }> {
    return { integrity: 'ok', fixes: [] };
  }

  async maintain(): Promise<boolean> {
    const now = this.now();
    const today = shiftDateOf(now);

    const { data: openShift } = await this.client
      .from('shifts')
      .select('*')
      .eq('status', 'OPEN')
      .maybeSingle();

    if (!openShift) {
      const { data: todayClosed } = await this.client
        .from('shifts')
        .select('id')
        .eq('date', today)
        .eq('status', 'CLOSED')
        .maybeSingle();

      if (!todayClosed) {
        await this.client.from('shifts').insert({
          date: today,
          opened_at: now,
          status: 'OPEN',
        });
        await this.bumpVersion('SHIFT_OPEN', 'sistema');
        return true;
      }
    } else if (openShift.date !== today) {
      // Turno do dia anterior ainda aberto -> encerra automaticamente e abre hoje
      await this.client
        .from('shifts')
        .update({ status: 'CLOSED', closed_at: now, close_reason: 'AUTO_ROLLOVER' })
        .eq('id', openShift.id);

      await this.client.from('shifts').insert({
        date: today,
        opened_at: now,
        status: 'OPEN',
      });
      await this.bumpVersion('SHIFT_ROLLOVER', 'sistema');
      return true;
    }

    return false;
  }

  async getSetting(key: string): Promise<string | undefined> {
    const { data } = await this.client.from('system_settings').select('value').eq('key', key).maybeSingle();
    return data?.value ?? undefined;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.client.from('system_settings').upsert({ key, value });
  }

  async seal(): Promise<void> {
    await this.client.from('audit_logs').update({ undoable: 0 }).eq('undoable', 1);
  }

  private async bumpVersion(_operation: string, _actor: string): Promise<number> {
    const { data: cur } = await this.client
      .from('system_settings')
      .select('value')
      .eq('key', 'version')
      .maybeSingle();

    const nextVer = (Number(cur?.value ?? '1') || 1) + 1;
    await this.client
      .from('system_settings')
      .upsert({ key: 'version', value: String(nextVer) });

    this.onChange?.();
    return nextVer;
  }

  private async getOpenShift(): Promise<any> {
    const { data, error } = await this.client
      .from('shifts')
      .select('*')
      .eq('status', 'OPEN')
      .maybeSingle();

    if (error || !data) throw new AppError('SHIFT_CLOSED');
    return data;
  }

  private async getSettingsMap(): Promise<Map<string, string>> {
    const { data } = await this.client.from('system_settings').select('*');
    return new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  }

  async snapshot(): Promise<StateSnapshot> {
    const now = this.now();
    const today = shiftDateOf(now);

    const [bRes, sRes, qRes, aRes, cfgMap, lastAuditRes, closedTodayRes] = await Promise.all([
      this.client.from('barbers').select('*').order('display_name'),
      this.client.from('shifts').select('*').eq('status', 'OPEN').maybeSingle(),
      this.client.from('queue_entries').select('*').eq('state', 'WAITING').order('seq'),
      this.client.from('attendances').select('*').eq('status', 'IN_PROGRESS'),
      this.getSettingsMap(),
      this.client
        .from('audit_logs')
        .select('*')
        .eq('undoable', 1)
        .is('undone_at', null)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.client.from('shifts').select('id').eq('date', today).eq('status', 'CLOSED').limit(1),
    ]);

    const barbers = bRes.data ?? [];
    const shift = sRes.data;
    const waiting = qRes.data ?? [];
    const activeAtts = aRes.data ?? [];

    const activeMap = new Map<number, any>(activeAtts.map((a: any) => [Number(a.barber_id), a]));
    const waitPosMap = new Map<number, { pos: number; enteredAt: number }>(
      waiting.map((q: any, idx: number) => [
        Number(q.barber_id),
        { pos: idx + 1, enteredAt: Number(q.entered_at) },
      ]),
    );

    const views: BarberView[] = barbers
      .filter((b: any) => b.active === 1)
      .map((b: any) => {
        const id = Number(b.id);
        const att = activeMap.get(id);
        const wait = waitPosMap.get(id);

        const state: BarberState = deriveState({
          hasActiveAttendance: !!att,
          isWaiting: !!wait,
          restState: b.rest_state,
        });

        const activeAtt: ActiveAttendance | null = att
          ? {
              id: Number(att.id),
              kind: att.kind as AttendanceKind,
              startedAt: Number(att.started_at),
              queuePosition: att.queue_position ? Number(att.queue_position) : null,
            }
          : null;

        return {
          id,
          fullName: b.full_name,
          displayName: b.display_name,
          photoUrl: b.photo,
          color: b.color,
          state,
          position: state === 'APTO' && wait ? wait.pos : null,
          queueEnteredAt: state === 'APTO' && wait ? wait.enteredAt : null,
          attendance: activeAtt,
        };
      });

    const order: Record<BarberState, number> = { APTO: 0, TRABALHANDO: 1, PAUSA: 2, FORA: 3 };
    views.sort((a, b) => {
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      if (a.state === 'APTO') return (a.position ?? 0) - (b.position ?? 0);
      if (a.state === 'TRABALHANDO') return (a.attendance?.startedAt ?? 0) - (b.attendance?.startedAt ?? 0);
      return a.displayName.localeCompare(b.displayName, 'pt-BR');
    });

    // Estatísticas do turno
    let completedCount = 0;
    let avgDuration: number | null = null;
    if (shift) {
      const { data: finished } = await this.client
        .from('attendances')
        .select('duration_seconds')
        .eq('shift_id', shift.id)
        .eq('status', 'FINISHED');

      if (finished && finished.length > 0) {
        completedCount = finished.length;
        const totalSec = finished.reduce((acc, row) => acc + (row.duration_seconds ?? 0), 0);
        avgDuration = Math.round(totalSec / finished.length);
      }
    }

    const working = views.filter((v) => v.state === 'TRABALHANDO');
    const longest = working.length
      ? Math.max(...working.map((w) => Math.round((now - (w.attendance?.startedAt ?? now)) / 1000)))
      : null;

    const undoWinSec = Number(cfgMap.get('undo_window_seconds') ?? '90') || 90;
    let undoInfo: UndoInfo | null = null;
    const latestAudit = lastAuditRes.data;
    if (latestAudit && shift && latestAudit.shift_id === shift.id) {
      const expiresAt = Number(latestAudit.created_at) + undoWinSec * 1000;
      if (now <= expiresAt) {
        const barber = barbers.find((b: any) => Number(b.id) === Number(latestAudit.barber_id));
        undoInfo = {
          auditId: Number(latestAudit.id),
          operation: latestAudit.operation as OperationName,
          barberName: barber?.display_name ?? '',
          expiresAt,
        };
      }
    }

    const version = Number(cfgMap.get('version') ?? '1') || 1;

    return {
      stream: 'supabase:prod',
      version,
      serverTime: now,
      mode: 'real',
      shop: {
        name: cfgMap.get('shop_name') ?? 'Barba de Urso',
        logoUrl: cfgMap.get('logo_url') ?? null,
      },
      shift: shift
        ? {
            id: Number(shift.id),
            date: shift.date,
            openedAt: Number(shift.opened_at),
            status: 'OPEN',
          }
        : null,
      shiftClosedToday: !shift && (closedTodayRes.data?.length ?? 0) > 0,
      barbers: views,
      stats: {
        waiting: views.filter((v) => v.state === 'APTO').length,
        working: working.length,
        resting: views.filter((v) => v.state === 'PAUSA' || v.state === 'FORA').length,
        activeBarbers: views.filter((v) => v.state !== 'FORA').length,
        completedToday: completedCount,
        avgDurationSeconds: avgDuration,
        longestRunningSeconds: longest,
      },
      undo: undoInfo,
    };
  }

  async enter(barberId: number, opts: ExecOpts): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    const { data: barber } = await this.client
      .from('barbers')
      .select('*')
      .eq('id', barberId)
      .single();

    if (!barber) throw new AppError('BARBER_NOT_FOUND');
    if (!barber.active) throw new AppError('BARBER_INACTIVE');

    const { data: waiting } = await this.client
      .from('queue_entries')
      .select('id')
      .eq('barber_id', barberId)
      .eq('state', 'WAITING')
      .maybeSingle();

    if (waiting) throw new AppError('ALREADY_IN_QUEUE');

    const { data: activeAtt } = await this.client
      .from('attendances')
      .select('id')
      .eq('barber_id', barberId)
      .eq('status', 'IN_PROGRESS')
      .maybeSingle();

    if (activeAtt) throw new AppError('ALREADY_WORKING');

    // Maior seq atual
    const { data: maxEntry } = await this.client
      .from('queue_entries')
      .select('seq')
      .eq('shift_id', shift.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSeq = (maxEntry?.seq ?? 0) + 1;

    const { data: inserted } = await this.client
      .from('queue_entries')
      .insert({
        barber_id: barberId,
        shift_id: shift.id,
        seq: nextSeq,
        entered_at: now,
        state: 'WAITING',
      })
      .select('id')
      .single();

    await this.client
      .from('barbers')
      .update({ rest_state: 'OFF', updated_at: now })
      .eq('id', barberId);

    const { data: auditRow } = await this.client
      .from('audit_logs')
      .insert({
        operation: 'ENTER',
        actor: opts.actor,
        barber_id: barberId,
        shift_id: shift.id,
        created_at: now,
        undoable: 1,
        info: JSON.stringify({ entryId: inserted?.id, prevRest: barber.rest_state }),
      })
      .select('id')
      .single();

    await this.bumpVersion('ENTER', opts.actor);
    const snap = await this.snapshot();

    return {
      ok: true,
      snapshot: snap,
      result: {
        operation: 'ENTER',
        auditId: auditRow?.id ?? 0,
        barberId,
        barberName: barber.display_name,
        position: snap.barbers.find((b) => b.id === barberId)?.position ?? nextSeq,
      },
    };
  }

  async resume(barberId: number, opts: ExecOpts): Promise<ApiOk> {
    const res = await this.enter(barberId, opts);
    if (res.result) res.result.operation = 'RESUME';
    return res;
  }

  async start(barberId: number, opts: ExecOpts): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    const { data: barber } = await this.client
      .from('barbers')
      .select('*')
      .eq('id', barberId)
      .single();

    if (!barber) throw new AppError('BARBER_NOT_FOUND');

    const { data: activeAtt } = await this.client
      .from('attendances')
      .select('id')
      .eq('barber_id', barberId)
      .eq('status', 'IN_PROGRESS')
      .maybeSingle();

    if (activeAtt) throw new AppError('ALREADY_WORKING');

    // Verifica posição na fila
    const { data: waitingList } = await this.client
      .from('queue_entries')
      .select('*')
      .eq('shift_id', shift.id)
      .eq('state', 'WAITING')
      .order('seq');

    const waitEntry = (waitingList ?? []).find((q: any) => Number(q.barber_id) === barberId);
    const pos = waitEntry ? (waitingList ?? []).indexOf(waitEntry) + 1 : null;
    const kind: AttendanceKind = pos === 1 ? 'ROTATION' : 'SPECIFIC';

    if (waitEntry) {
      await this.client
        .from('queue_entries')
        .update({ state: 'SERVED', left_at: now })
        .eq('id', waitEntry.id);
    }

    const { data: att } = await this.client
      .from('attendances')
      .insert({
        shift_id: shift.id,
        barber_id: barberId,
        kind,
        queue_position: pos,
        started_at: now,
        status: 'IN_PROGRESS',
      })
      .select('id')
      .single();

    const { data: auditRow } = await this.client
      .from('audit_logs')
      .insert({
        operation: 'START',
        actor: opts.actor,
        barber_id: barberId,
        shift_id: shift.id,
        created_at: now,
        undoable: 1,
        info: JSON.stringify({
          attendanceId: att?.id,
          entryId: waitEntry?.id ?? null,
          prevPosition: pos,
        }),
      })
      .select('id')
      .single();

    await this.bumpVersion('START', opts.actor);
    const snap = await this.snapshot();

    return {
      ok: true,
      snapshot: snap,
      result: {
        operation: 'START',
        auditId: auditRow?.id ?? 0,
        barberId,
        barberName: barber.display_name,
        kind,
      },
    };
  }

  async startNext(opts: ExecOpts): Promise<ApiOk> {
    const shift = await this.getOpenShift();
    const { data: first } = await this.client
      .from('queue_entries')
      .select('barber_id')
      .eq('shift_id', shift.id)
      .eq('state', 'WAITING')
      .order('seq')
      .limit(1)
      .maybeSingle();

    if (!first) throw new AppError('NO_BARBERS_AVAILABLE');
    return this.start(Number(first.barber_id), opts);
  }

  async finish(barberId: number, opts: ExecOpts): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    const { data: barber } = await this.client
      .from('barbers')
      .select('*')
      .eq('id', barberId)
      .single();

    if (!barber) throw new AppError('BARBER_NOT_FOUND');

    let attQuery = this.client
      .from('attendances')
      .select('*')
      .eq('barber_id', barberId)
      .eq('status', 'IN_PROGRESS');

    if (opts.attendanceId) {
      attQuery = attQuery.eq('id', opts.attendanceId);
    }

    const { data: att } = await attQuery.maybeSingle();
    if (!att) throw new AppError('NOT_WORKING');

    const durationSec = Math.max(0, Math.round((now - Number(att.started_at)) / 1000));

    await this.client
      .from('attendances')
      .update({
        status: 'FINISHED',
        finished_at: now,
        duration_seconds: durationSec,
      })
      .eq('id', att.id);

    // Retorna ao final da fila
    const { data: maxEntry } = await this.client
      .from('queue_entries')
      .select('seq')
      .eq('shift_id', shift.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSeq = (maxEntry?.seq ?? 0) + 1;

    const { data: newEntry } = await this.client
      .from('queue_entries')
      .insert({
        barber_id: barberId,
        shift_id: shift.id,
        seq: nextSeq,
        entered_at: now,
        state: 'WAITING',
      })
      .select('id')
      .single();

    const { data: auditRow } = await this.client
      .from('audit_logs')
      .insert({
        operation: 'FINISH',
        actor: opts.actor,
        barber_id: barberId,
        shift_id: shift.id,
        created_at: now,
        undoable: 1,
        info: JSON.stringify({
          attendanceId: att.id,
          newEntryId: newEntry?.id,
          durationSeconds: durationSec,
        }),
      })
      .select('id')
      .single();

    await this.bumpVersion('FINISH', opts.actor);
    const snap = await this.snapshot();

    return {
      ok: true,
      snapshot: snap,
      result: {
        operation: 'FINISH',
        auditId: auditRow?.id ?? 0,
        barberId,
        barberName: barber.display_name,
        durationSeconds: durationSec,
      },
    };
  }

  async pause(barberId: number, opts: ExecOpts): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    const { data: barber } = await this.client
      .from('barbers')
      .select('*')
      .eq('id', barberId)
      .single();

    if (!barber) throw new AppError('BARBER_NOT_FOUND');

    const { data: waitEntry } = await this.client
      .from('queue_entries')
      .select('*')
      .eq('barber_id', barberId)
      .eq('state', 'WAITING')
      .maybeSingle();

    if (!waitEntry) throw new AppError('NOT_IN_QUEUE');

    await this.client
      .from('queue_entries')
      .update({ state: 'REMOVED', exit_reason: 'PAUSE', left_at: now })
      .eq('id', waitEntry.id);

    await this.client
      .from('barbers')
      .update({ rest_state: 'PAUSED', updated_at: now })
      .eq('id', barberId);

    const { data: auditRow } = await this.client
      .from('audit_logs')
      .insert({
        operation: 'PAUSE',
        actor: opts.actor,
        barber_id: barberId,
        shift_id: shift.id,
        created_at: now,
        undoable: 1,
        info: JSON.stringify({ entryId: waitEntry.id, prevRest: barber.rest_state }),
      })
      .select('id')
      .single();

    await this.bumpVersion('PAUSE', opts.actor);
    const snap = await this.snapshot();

    return {
      ok: true,
      snapshot: snap,
      result: {
        operation: 'PAUSE',
        auditId: auditRow?.id ?? 0,
        barberId,
        barberName: barber.display_name,
      },
    };
  }

  async clockOut(barberId: number, opts: ExecOpts): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    const { data: barber } = await this.client
      .from('barbers')
      .select('*')
      .eq('id', barberId)
      .single();

    if (!barber) throw new AppError('BARBER_NOT_FOUND');

    const { data: waitEntry } = await this.client
      .from('queue_entries')
      .select('*')
      .eq('barber_id', barberId)
      .eq('state', 'WAITING')
      .maybeSingle();

    if (waitEntry) {
      await this.client
        .from('queue_entries')
        .update({ state: 'REMOVED', exit_reason: 'CLOCK_OUT', left_at: now })
        .eq('id', waitEntry.id);
    }

    await this.client
      .from('barbers')
      .update({ rest_state: 'OFF', updated_at: now })
      .eq('id', barberId);

    const { data: auditRow } = await this.client
      .from('audit_logs')
      .insert({
        operation: 'CLOCK_OUT',
        actor: opts.actor,
        barber_id: barberId,
        shift_id: shift.id,
        created_at: now,
        undoable: true,
        info: JSON.stringify({ entryId: waitEntry?.id, prevRest: barber.rest_state }),
      })
      .select('id')
      .single();

    await this.bumpVersion('CLOCK_OUT', opts.actor);
    const snap = await this.snapshot();

    return {
      ok: true,
      snapshot: snap,
      result: {
        operation: 'CLOCK_OUT',
        auditId: auditRow?.id ?? 0,
        barberId,
        barberName: barber.display_name,
      },
    };
  }

  async undo(auditId: number, opts: ExecOpts): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    const { data: row } = await this.client
      .from('audit_logs')
      .select('*')
      .eq('id', auditId)
      .single();

    if (!row || !row.undoable || row.undone_at) throw new AppError('UNDO_NOT_FOUND');

    const cfgMap = await this.getSettingsMap();
    const windowSec = Number(cfgMap.get('undo_window_seconds') ?? '90') || 90;
    if (now - Number(row.created_at) > windowSec * 1000) throw new AppError('UNDO_EXPIRED');

    if (row.shift_id !== shift.id) throw new AppError('UNDO_BLOCKED');

    // Verifica se houve alteração posterior
    const { data: later } = await this.client
      .from('audit_logs')
      .select('id')
      .gt('id', row.id)
      .is('undone_at', null)
      .limit(1);

    if (later && later.length > 0) throw new AppError('UNDO_BLOCKED');

    const info = JSON.parse(row.info ?? '{}');

    switch (row.operation) {
      case 'ENTER':
      case 'RESUME': {
        if (info.entryId) {
          await this.client
            .from('queue_entries')
            .update({ state: 'VOIDED', exit_reason: 'UNDO', left_at: now })
            .eq('id', info.entryId);
        }
        if (row.barber_id) {
          await this.client
            .from('barbers')
            .update({ rest_state: info.prevRest ?? 'OFF', updated_at: now })
            .eq('id', row.barber_id);
        }
        break;
      }
      case 'START': {
        if (info.attendanceId) {
          await this.client
            .from('attendances')
            .update({ status: 'CANCELLED' })
            .eq('id', info.attendanceId);
        }
        if (info.entryId) {
          await this.client
            .from('queue_entries')
            .update({ state: 'WAITING', left_at: null })
            .eq('id', info.entryId);
        }
        break;
      }
      case 'FINISH': {
        if (info.attendanceId) {
          await this.client
            .from('attendances')
            .update({ status: 'IN_PROGRESS', finished_at: null, duration_seconds: null })
            .eq('id', info.attendanceId);
        }
        if (info.newEntryId) {
          await this.client
            .from('queue_entries')
            .update({ state: 'VOIDED', exit_reason: 'UNDO', left_at: now })
            .eq('id', info.newEntryId);
        }
        break;
      }
      case 'PAUSE': {
        if (info.entryId) {
          await this.client
            .from('queue_entries')
            .update({ state: 'WAITING', exit_reason: null, left_at: null })
            .eq('id', info.entryId);
        }
        if (row.barber_id) {
          await this.client
            .from('barbers')
            .update({ rest_state: info.prevRest ?? 'OFF', updated_at: now })
            .eq('id', row.barber_id);
        }
        break;
      }
      case 'CLOCK_OUT': {
        if (info.entryId) {
          await this.client
            .from('queue_entries')
            .update({ state: 'WAITING', exit_reason: null, left_at: null })
            .eq('id', info.entryId);
        }
        if (row.barber_id) {
          await this.client
            .from('barbers')
            .update({ rest_state: info.prevRest ?? 'OFF', updated_at: now })
            .eq('id', row.barber_id);
        }
        break;
      }
    }

    await this.client
      .from('audit_logs')
      .update({ undone_at: now, undoable: 0 })
      .eq('id', auditId);

    await this.bumpVersion('UNDO', opts.actor);
    const snap = await this.snapshot();

    return {
      ok: true,
      snapshot: snap,
      result: {
        operation: 'UNDO',
        auditId,
        barberId: row.barber_id,
        barberName: snap.barbers.find((b) => b.id === row.barber_id)?.displayName ?? null,
      },
    };
  }

  async adminBarbers(): Promise<AdminBarber[]> {
    const snap = await this.snapshot();
    const viewsMap = new Map(snap.barbers.map((b) => [b.id, b]));

    const [allBarbersRes, attCountsRes] = await Promise.all([
      this.client.from('barbers').select('*').order('active', { ascending: false }).order('display_name'),
      this.client.from('attendances').select('barber_id').eq('status', 'FINISHED'),
    ]);

    const counts = new Map<number, number>();
    for (const a of attCountsRes.data ?? []) {
      const bid = Number(a.barber_id);
      counts.set(bid, (counts.get(bid) ?? 0) + 1);
    }

    return (allBarbersRes.data ?? []).map((b: any) => {
      const id = Number(b.id);
      const v = viewsMap.get(id);
      const state = b.active ? (v ? v.state : 'FORA') : 'INATIVO';

      return {
        id,
        fullName: b.full_name,
        displayName: b.display_name,
        photoUrl: b.photo,
        color: b.color,
        active: b.active === 1,
        state,
        totalAttendances: counts.get(id) ?? 0,
        createdAt: Number(b.created_at),
      };
    });
  }

  async createBarber(input: { fullName: string; displayName: string; color: string | null }, actor: string): Promise<{ id: number; ok: ApiOk }> {
    const now = this.now();
    const { data: inserted } = await this.client
      .from('barbers')
      .insert({
        full_name: input.fullName,
        display_name: input.displayName,
        color: input.color,
        active: 1,
        rest_state: 'OFF',
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    const id = Number(inserted?.id);

    await this.client.from('audit_logs').insert({
      operation: 'BARBER_CREATE',
      actor,
      barber_id: id,
      created_at: now,
      undoable: 0,
      info: JSON.stringify({ name: input.displayName }),
    });

    await this.bumpVersion('BARBER_CREATE', actor);
    const snap = await this.snapshot();

    return {
      id,
      ok: {
        ok: true,
        snapshot: snap,
        result: {
          operation: 'ENTER',
          auditId: 0,
          barberId: id,
          barberName: input.displayName,
        },
      },
    };
  }

  async updateBarber(id: number, input: { fullName: string; displayName: string; color: string | null }, actor: string): Promise<ApiOk> {
    const now = this.now();
    await this.client
      .from('barbers')
      .update({
        full_name: input.fullName,
        display_name: input.displayName,
        color: input.color,
        updated_at: now,
      })
      .eq('id', id);

    await this.bumpVersion('BARBER_UPDATE', actor);
    const snap = await this.snapshot();
    return { ok: true, snapshot: snap };
  }

  async setBarberPhoto(id: number, photo: string | null, actor: string): Promise<ApiOk> {
    const now = this.now();
    await this.client
      .from('barbers')
      .update({ photo, updated_at: now })
      .eq('id', id);

    await this.bumpVersion('BARBER_PHOTO', actor);
    const snap = await this.snapshot();
    return { ok: true, snapshot: snap };
  }

  async setBarberActive(id: number, active: boolean, actor: string): Promise<ApiOk> {
    const now = this.now();
    if (!active) {
      // Remove da fila se estiver aguardando
      await this.client
        .from('queue_entries')
        .update({ state: 'REMOVED', exit_reason: 'DEACTIVATED', left_at: now })
        .eq('barber_id', id)
        .eq('state', 'WAITING');
    }

    await this.client
      .from('barbers')
      .update({ active: active ? 1 : 0, updated_at: now })
      .eq('id', id);

    await this.bumpVersion(active ? 'BARBER_ACTIVATE' : 'BARBER_DEACTIVATE', actor);
    const snap = await this.snapshot();
    return { ok: true, snapshot: snap };
  }

  async history(filter: { from?: number; to?: number; barberId?: number; limit?: number; offset?: number }): Promise<{ rows: AttendanceRow[]; total: number }> {
    let q = this.client
      .from('attendances')
      .select('id, shift_id, barber_id, kind, queue_position, started_at, finished_at, duration_seconds, status, barbers(display_name)', { count: 'exact' });

    if (filter.from) q = q.gte('started_at', filter.from);
    if (filter.to) q = q.lte('started_at', filter.to);
    if (filter.barberId) q = q.eq('barber_id', filter.barberId);

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    q = q.order('started_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count } = await q;

    const rows: AttendanceRow[] = (data ?? []).map((r: any) => ({
      id: Number(r.id),
      barberId: Number(r.barber_id),
      barberName: r.barbers?.display_name ?? 'Barbeiro',
      shiftId: Number(r.shift_id),
      shiftDate: '',
      kind: r.kind,
      queuePosition: r.queue_position ? Number(r.queue_position) : null,
      startedAt: Number(r.started_at),
      endedAt: r.finished_at ? Number(r.finished_at) : null,
      durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : null,
      status: r.status,
      source: null,
    }));

    return {
      rows,
      total: count ?? rows.length,
    };
  }

  async auditLogs(limit = 50, offset = 0): Promise<{ rows: AuditRow[]; total: number }> {
    const { data, count } = await this.client
      .from('audit_logs')
      .select('*, barbers(display_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const rows: AuditRow[] = (data ?? []).map((r: any) => ({
      id: Number(r.id),
      operation: r.operation,
      actor: r.actor,
      barberId: r.barber_id ? Number(r.barber_id) : null,
      barberName: r.barbers?.display_name ?? null,
      createdAt: Number(r.created_at),
      info: r.info ? (JSON.parse(r.info) as Record<string, unknown>) : null,
      undone: r.undone_at !== null,
    }));

    return { rows, total: count ?? rows.length };
  }

  async openShift(actor: string): Promise<ApiOk> {
    const now = this.now();
    const today = shiftDateOf(now);

    const { data: existingOpen } = await this.client
      .from('shifts')
      .select('id')
      .eq('status', 'OPEN')
      .maybeSingle();

    if (existingOpen) throw new AppError('SHIFT_ALREADY_OPEN');

    const { data: inserted } = await this.client
      .from('shifts')
      .insert({ date: today, opened_at: now, status: 'OPEN' })
      .select('id')
      .single();

    // Coloca profissionais ativos na fila se ela estiver vazia
    const { data: activeBarbers } = await this.client
      .from('barbers')
      .select('id')
      .eq('active', 1)
      .order('id');

    if (activeBarbers && activeBarbers.length > 0) {
      const entries = activeBarbers.map((b: any, idx: number) => ({
        barber_id: b.id,
        shift_id: inserted?.id,
        seq: idx + 1,
        entered_at: now + idx * 100,
        state: 'WAITING',
      }));
      await this.client.from('queue_entries').insert(entries);
    }

    await this.bumpVersion('SHIFT_OPEN', actor);
    const snap = await this.snapshot();
    return { ok: true, snapshot: snap };
  }

  async closeShift(actor: string): Promise<ApiOk> {
    const now = this.now();
    const shift = await this.getOpenShift();

    // Encerra atendimentos em andamento
    await this.client
      .from('attendances')
      .update({ status: 'CLOSED_BY_SHIFT', finished_at: now })
      .eq('shift_id', shift.id)
      .eq('status', 'IN_PROGRESS');

    // Remove aguardando da fila
    await this.client
      .from('queue_entries')
      .update({ state: 'REMOVED', exit_reason: 'SHIFT_CLOSED', left_at: now })
      .eq('shift_id', shift.id)
      .eq('state', 'WAITING');

    await this.client
      .from('shifts')
      .update({ status: 'CLOSED', closed_at: now, close_reason: 'MANUAL' })
      .eq('id', shift.id);

    await this.bumpVersion('SHIFT_CLOSE', actor);
    const snap = await this.snapshot();
    return { ok: true, snapshot: snap };
  }

  async touch(actor: string): Promise<void> {
    await this.bumpVersion('SETTINGS_UPDATE', actor);
  }

  async summary(_filter: any): Promise<BarberSummaryRow[]> {
    return [];
  }

  async auditLog(limit = 50, offset = 0): Promise<{ rows: AuditRow[]; total: number }> {
    return this.auditLogs(limit, offset);
  }

  get barbers() {
    return {
      get: async (id: number) => {
        const { data } = await this.client.from('barbers').select('*').eq('id', id).maybeSingle();
        return data;
      },
    };
  }

  backupTo(_destFile: string): void {
    // Backups no Supabase são automáticos e gerenciados na nuvem.
  }
}
