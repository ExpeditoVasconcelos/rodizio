import {
  LogOut,
  Pause,
  Play,
  Power,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BarberView, StateSnapshot } from '../../../shared/types';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { formatClock, formatDuration, KIND_LABEL, operationPhrase, STATE_LABEL } from '../../domain/format';
import { pushToast } from '../../hooks/toasts';
import { useNow } from '../../hooks/useNow';
import { useOperations } from '../../hooks/useOperations';
import { adminApi } from '../../services/admin/adminService';
import { attendanceService } from '../../services/attendance/attendanceService';
import { ApiError } from '../../services/http';
import { queueService } from '../../services/queue/queueService';

export function ReceptionLiveTab({ snapshot }: { snapshot: StateSnapshot | null }) {
  const now = useNow();
  const ops = useOperations();
  const [prefOpen, setPrefOpen] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);

  const barbers = snapshot?.barbers ?? [];
  const queue = useMemo(() => barbers.filter((b) => b.state === 'APTO'), [barbers]);
  const working = useMemo(() => barbers.filter((b) => b.state === 'TRABALHANDO'), [barbers]);
  const resting = useMemo(() => barbers.filter((b) => b.state === 'PAUSA' || b.state === 'FORA'), [barbers]);
  const nextBarber = queue[0] ?? null;

  const callNextRotation = () => {
    void ops.run(nextBarber?.id ?? 0, () => attendanceService.startNext());
  };

  const selectPreferredBarber = (b: BarberView) => {
    if (b.state === 'TRABALHANDO') {
      pushToast('error', `Indisponível: ${b.displayName} já está em atendimento.`);
      return;
    }
    if (b.state === 'PAUSA') {
      pushToast('error', `Indisponível: ${b.displayName} está em pausa.`);
      return;
    }
    if (b.state === 'FORA') {
      pushToast('error', `Indisponível: ${b.displayName} está fora do expediente.`);
      return;
    }
    setPrefOpen(false);
    void ops.run(b.id, () => attendanceService.start(b.id));
  };

  const toggleShift = async () => {
    if (!snapshot) return;
    setShiftBusy(true);
    try {
      if (snapshot.shift) {
        await adminApi.closeShift();
        pushToast('info', 'Turno encerrado.');
      } else {
        await adminApi.openShift();
        pushToast('success', 'Novo turno aberto.');
      }
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao alterar o turno.');
    } finally {
      setShiftBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!snapshot?.undo) return;
    try {
      await queueService.undo(snapshot.undo.auditId);
      pushToast('success', 'Ação desfeita.');
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Não foi possível desfazer.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da seção e controles de direcionamento */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Rodízio ao vivo</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {snapshot?.shift
              ? `Turno aberto às ${formatClock(snapshot.shift.openedAt)} · ${snapshot.stats.completedToday} atendimentos concluídos hoje`
              : 'Turno encerrado'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot?.undo && snapshot.undo.expiresAt > now && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleUndo}
              icon={<Undo2 size={14} />}
              title={`Desfazer: ${snapshot.undo.barberName} ${operationPhrase(snapshot.undo.operation)}`}
            >
              Desfazer ({snapshot.undo.barberName})
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPrefOpen(true)}
            disabled={!snapshot?.shift}
            data-testid="reception-preference-btn"
          >
            Cliente com preferência
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={callNextRotation}
            disabled={!snapshot?.shift}
            icon={<Play size={14} />}
            data-testid="reception-call-next"
          >
            {nextBarber ? `Chamar próximo (${nextBarber.displayName})` : 'Chamar próximo'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={shiftBusy}
            onClick={toggleShift}
            icon={<Power size={14} />}
            data-testid="reception-shift-toggle"
            className="border border-zinc-200"
          >
            {snapshot?.shift ? 'Encerrar turno' : 'Abrir turno'}
          </Button>
        </div>
      </div>

      {/* Duas tabelas principais: NA FILA e TRABALHANDO */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tabela NA FILA */}
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="h-[2px] w-full bg-[#0d9488]" />
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#0d9488]" />
              <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Na Fila</h2>
            </div>
            <span className="tabular rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
              {queue.length}
            </span>
          </header>

          <div className="divide-y divide-zinc-100">
            {queue.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">Nenhum profissional na fila.</div>
            ) : (
              queue.map((b) => {
                const wait = b.queueEnteredAt ? (now - b.queueEnteredAt) / 1000 : 0;
                const isFirst = b.position === 1;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`tabular grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-bold ${isFirst ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
                        }`}
                    >
                      {b.position}º
                    </span>
                    <Avatar name={b.displayName} photoUrl={b.photoUrl} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-bold"
                          style={{ color: b.color ?? '#09090b' }}
                        >
                          {b.displayName}
                        </span>
                        {isFirst && (
                          <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white uppercase">
                            Próximo
                          </span>
                        )}
                      </div>
                      <div className="tabular text-xs text-zinc-400">Espera {formatDuration(wait)}</div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ops.pending.has(b.id)}
                        onClick={() => void ops.run(b.id, () => queueService.pause(b.id))}
                        title="Pausa"
                      >
                        <Pause size={13} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ops.pending.has(b.id)}
                        onClick={() => void ops.run(b.id, () => queueService.clockOut(b.id))}
                        title="Encerrar expediente"
                      >
                        <LogOut size={13} />
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={ops.pending.has(b.id)}
                        onClick={() => void ops.run(b.id, () => attendanceService.start(b.id))}
                      >
                        Atender
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Tabela TRABALHANDO */}
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="h-[2px] w-full bg-[#d97706]" />
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#d97706]" />
              <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Trabalhando</h2>
            </div>
            <span className="tabular rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
              {working.length}
            </span>
          </header>

          <div className="divide-y divide-zinc-100">
            {working.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">Nenhum atendimento em andamento.</div>
            ) : (
              working.map((b) => {
                const att = b.attendance;
                const elapsed = att ? (now - att.startedAt) / 1000 : 0;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={b.displayName} photoUrl={b.photoUrl} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-bold"
                          style={{ color: b.color ?? '#09090b' }}
                        >
                          {b.displayName}
                        </span>
                        {att && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-zinc-600 uppercase">
                            {KIND_LABEL[att.kind]}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400">
                        Início {att ? formatClock(att.startedAt) : '--:--'}
                      </div>
                    </div>

                    <div className="tabular text-sm font-bold text-zinc-900">{formatDuration(elapsed)}</div>

                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={ops.pending.has(b.id)}
                      onClick={() => void ops.run(b.id, () => attendanceService.finish(b.id, b.attendance?.id))}
                    >
                      Finalizar
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Fora da fila (Pausa / Fora do expediente) */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-600 uppercase">
            Pausa e fora do expediente ({resting.length})
          </h2>
        </header>
        {resting.length === 0 ? (
          <div className="p-5 text-xs text-zinc-400">Todos os profissionais ativos estão na fila ou atendendo.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {resting.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar name={b.displayName} photoUrl={b.photoUrl} size={32} />
                  <div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: b.color ?? '#09090b' }}
                    >
                      {b.displayName}
                    </span>
                    <span className="ml-2 text-xs text-zinc-400">{STATE_LABEL[b.state]}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {b.state === 'PAUSA' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ops.pending.has(b.id) || !snapshot?.shift}
                      onClick={() => void ops.run(b.id, () => queueService.clockOut(b.id))}
                    >
                      Encerrar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={ops.pending.has(b.id) || !snapshot?.shift}
                    onClick={() =>
                      void ops.run(b.id, () =>
                        b.state === 'PAUSA' ? queueService.resume(b.id) : queueService.enter(b.id),
                      )
                    }
                    icon={<UserCheck size={14} />}
                  >
                    {b.state === 'PAUSA' ? 'Voltar à fila' : 'Estou disponível'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal: Cliente com Preferência */}
      <Sheet
        open={prefOpen}
        onClose={() => setPrefOpen(false)}
        placement="center"
        title={
          <div>
            <div className="text-base font-bold text-zinc-900">Atendimento com preferência</div>
            <p className="text-xs text-zinc-500">
              Selecione o profissional solicitado pelo cliente.
            </p>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {barbers.map((b) => {
            const available = b.state === 'APTO';
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => selectPreferredBarber(b)}
                data-testid={`pref-barber-${b.displayName}`}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${available
                    ? 'border-zinc-200 bg-white hover:border-zinc-900'
                    : 'border-zinc-100 bg-zinc-50 opacity-60'
                  }`}
              >
                <Avatar name={b.displayName} photoUrl={b.photoUrl} size={38} />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-bold"
                    style={{ color: b.color ?? '#09090b' }}
                  >
                    {b.displayName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {available
                      ? b.position === 1
                        ? '1º da fila · Rodízio'
                        : `${b.position}º da fila · Preferência`
                      : `Indisponível (${STATE_LABEL[b.state]})`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
