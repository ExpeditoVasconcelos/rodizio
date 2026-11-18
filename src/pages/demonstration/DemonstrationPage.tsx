import {
  ArrowLeft,
  Maximize2,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Undo2,
  UserCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BarberView } from '../../../shared/types';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConnectionBadge } from '../../components/ui/ConnectionBadge';
import { Sheet } from '../../components/ui/Sheet';
import { Toasts } from '../../components/ui/Toasts';
import { formatDuration, KIND_LABEL, STATE_LABEL } from '../../domain/format';
import { pushToast } from '../../hooks/toasts';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useNow } from '../../hooks/useNow';
import { useOperations } from '../../hooks/useOperations';
import { useRodizio } from '../../hooks/useRodizio';
import { attendanceService } from '../../services/attendance/attendanceService';
import { demoService, type NetworkInfo } from '../../services/demo/demoService';
import { queueService } from '../../services/queue/queueService';

export default function DemonstrationPage() {
  const navigate = useNavigate();
  const { snapshot, status } = useRodizio();
  const now = useNow();
  const fs = useFullscreen();
  const ops = useOperations();
  const [busyMode, setBusyMode] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [net, setNet] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    void demoService
      .network()
      .then(setNet)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (snapshot && snapshot.mode !== 'demo') {
      void demoService.activate().catch(() => null);
    }
  }, [snapshot?.mode]);

  const barbers = snapshot?.barbers ?? [];
  const queue = useMemo(() => barbers.filter((b) => b.state === 'APTO'), [barbers]);
  const working = useMemo(() => barbers.filter((b) => b.state === 'TRABALHANDO'), [barbers]);
  const resting = useMemo(() => barbers.filter((b) => b.state === 'PAUSA' || b.state === 'FORA'), [barbers]);

  const handleReset = async () => {
    setBusyMode(true);
    try {
      await demoService.reset();
      pushToast('success', 'Demonstração reiniciada.');
    } catch {
      pushToast('error', 'Não foi possível reiniciar a demonstração.');
    } finally {
      setBusyMode(false);
    }
  };

  const handleExitDemo = async () => {
    setBusyMode(true);
    try {
      await demoService.exit();
      navigate('/');
    } catch {
      pushToast('error', 'Não foi possível sair do modo demonstração.');
    } finally {
      setBusyMode(false);
    }
  };

  const openTabletFullscreen = async () => {
    await fs.enter();
    sessionStorage.setItem('rodizio.gate.ok', '1');
    navigate('/painel');
  };

  const simulateRotationStart = () => {
    const first = queue[0];
    if (!first) {
      pushToast('error', 'NÃO EXISTEM BARBEIROS DISPONÍVEIS.');
      return;
    }
    void ops.run(first.id, () => attendanceService.start(first.id));
  };

  const simulateSpecificChoice = () => {
    const target = queue.find((b) => (b.position ?? 0) >= 2) ?? queue[0];
    if (!target) {
      pushToast('error', 'NÃO EXISTEM BARBEIROS DISPONÍVEIS.');
      return;
    }
    void ops.run(target.id, () => attendanceService.start(target.id));
  };

  const simulateFinishFirst = () => {
    const firstWorking = working[0];
    if (!firstWorking) {
      pushToast('error', 'Nenhum atendimento em andamento.');
      return;
    }
    void ops.run(firstWorking.id, () => attendanceService.finish(firstWorking.id, firstWorking.attendance?.id));
  };

  const simulatePauseOrResume = () => {
    const paused = resting.find((b) => b.state === 'PAUSA');
    if (paused) {
      void ops.run(paused.id, () => queueService.resume(paused.id));
      return;
    }
    const inQueue = queue[0];
    if (inQueue) void ops.run(inQueue.id, () => queueService.pause(inQueue.id));
  };

  const simulateEnterOff = () => {
    const off = resting.find((b) => b.state === 'FORA');
    if (off) void ops.run(off.id, () => queueService.enter(off.id));
  };

  const primaryLan = net?.addresses[0];
  const tabletUrl = primaryLan ? `${primaryLan.url}/painel` : `${location.origin}/painel`;

  return (
    <div className="min-h-dvh w-full bg-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => navigate('/')} icon={<ArrowLeft size={15} />}>
              Início
            </Button>
            <div className="h-4 w-px bg-zinc-200" />
            <div>
              <h1 className="text-base font-bold text-zinc-900">Modo Demonstração</h1>
              <p className="text-xs text-zinc-500">
                Banco isolado (<code className="text-zinc-700">demo.db</code>) · Dados reais preservados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ConnectionBadge status={status} />
            <Button size="sm" variant="secondary" onClick={() => setQrOpen(true)} icon={<QrCode size={14} />}>
              Conectar celular/tablet
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busyMode}
              onClick={handleReset}
              icon={<RotateCcw size={14} />}
              data-testid="reset-demo-btn"
            >
              Reiniciar demonstração
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyMode}
              onClick={handleExitDemo}
              data-testid="exit-demo-btn"
              className="border border-zinc-200"
            >
              Voltar ao modo real
            </Button>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Controles de simulação */}
          <div className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 lg:col-span-4">
            <div>
              <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Ações de simulação</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Barbeiros fictícios: João, Carlos, Pedro, Marcos, Rafael e Lucas.
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={simulateRotationStart}
                  icon={<Play size={14} />}
                  data-testid="sim-rotation"
                  className="justify-start text-left"
                >
                  1. Iniciar pelo rodízio (1º da fila)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={simulateSpecificChoice}
                  data-testid="sim-specific"
                  className="justify-start text-left"
                >
                  2. Iniciar por preferência (2º+ da fila)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={simulateFinishFirst}
                  icon={<Undo2 size={14} />}
                  data-testid="sim-finish"
                  className="justify-start text-left"
                >
                  3. Finalizar atendimento (volta ao fim)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={simulatePauseOrResume}
                  icon={<Pause size={14} />}
                  data-testid="sim-pause"
                  className="justify-start text-left"
                >
                  4. Alternar pausa / retorno à fila
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={simulateEnterOff}
                  icon={<UserCheck size={14} />}
                  data-testid="sim-enter"
                  className="justify-start text-left"
                >
                  5. Estou disponível (Lucas)
                </Button>
              </div>
            </div>

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <Button
                size="md"
                variant="primary"
                onClick={openTabletFullscreen}
                icon={<Maximize2 size={15} />}
                data-testid="demo-open-panel"
                className="w-full"
              >
                Abrir painel em tela cheia
              </Button>
            </div>
          </div>

          {/* Duas tabelas ao vivo */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="h-[2px] w-full bg-[#0d9488]" />
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#0d9488]" />
                  <h3 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Na Fila</h3>
                </div>
                <span className="tabular rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                  {queue.length}
                </span>
              </div>

              <div className="divide-y divide-zinc-100" data-testid="demo-queue-list">
                {queue.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">Nenhum barbeiro na fila</div>
                ) : (
                  queue.map((b) => (
                    <DemoQueueRow
                      key={b.id}
                      barber={b}
                      now={now}
                      busy={ops.pending.has(b.id)}
                      onStart={() => void ops.run(b.id, () => attendanceService.start(b.id))}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="h-[2px] w-full bg-[#d97706]" />
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#d97706]" />
                  <h3 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Trabalhando</h3>
                </div>
                <span className="tabular rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                  {working.length}
                </span>
              </div>

              <div className="divide-y divide-zinc-100" data-testid="demo-working-list">
                {working.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400">Nenhum atendimento em andamento</div>
                ) : (
                  working.map((b) => (
                    <DemoWorkingRow
                      key={b.id}
                      barber={b}
                      now={now}
                      busy={ops.pending.has(b.id)}
                      onFinish={() => void ops.run(b.id, () => attendanceService.finish(b.id, b.attendance?.id))}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 md:col-span-2">
              <div className="mb-2 text-xs font-bold tracking-[0.12em] text-zinc-500 uppercase">
                Pausa e fora do expediente
              </div>
              <div className="flex flex-wrap gap-2" data-testid="demo-resting-list">
                {resting.length === 0 ? (
                  <span className="text-xs text-zinc-400">Todos os profissionais estão ativos no quadro.</span>
                ) : (
                  resting.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5"
                    >
                      <span
                        className="text-xs font-bold"
                        style={{ color: b.color ?? '#09090b' }}
                      >
                        {b.displayName}
                      </span>
                      <span className="text-[0.65rem] text-zinc-400">{STATE_LABEL[b.state]}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={ops.pending.has(b.id)}
                        onClick={() =>
                          void ops.run(b.id, () =>
                            b.state === 'PAUSA' ? queueService.resume(b.id) : queueService.enter(b.id),
                          )
                        }
                        className="!min-h-7 px-2 text-[0.68rem]"
                      >
                        Entrar
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Sheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        placement="center"
        title={<div className="text-base font-bold text-zinc-900">Demonstração em 2 dispositivos</div>}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <QRCodeSVG value={tabletUrl} size={170} level="M" />
          </div>
          <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-[0.65rem] font-semibold text-zinc-400 uppercase">Abra no celular ou tablet</div>
            <div className="mt-1 select-all font-mono text-sm font-bold text-zinc-900">{tabletUrl}</div>
          </div>
        </div>
      </Sheet>

      <Toasts />
    </div>
  );
}

function DemoQueueRow({
  barber,
  now,
  busy,
  onStart,
}: {
  barber: BarberView;
  now: number;
  busy: boolean;
  onStart: () => void;
}) {
  const wait = barber.queueEnteredAt ? (now - barber.queueEnteredAt) / 1000 : 0;
  const isNext = barber.position === 1;
  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid={`demo-queue-${barber.displayName}`}>
      <span
        className={`tabular grid h-7 w-7 shrink-0 place-items-center rounded text-xs font-bold ${isNext ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
          }`}
      >
        {barber.position}º
      </span>
      <Avatar name={barber.displayName} photoUrl={barber.photoUrl} size={32} />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-bold"
          style={{ color: barber.color ?? '#09090b' }}
        >
          {barber.displayName}
        </div>
        <div className="tabular text-xs text-zinc-400">Espera {formatDuration(wait)}</div>
      </div>
      <Button size="sm" variant="primary" disabled={busy} onClick={onStart}>
        Atender
      </Button>
    </div>
  );
}

function DemoWorkingRow({
  barber,
  now,
  busy,
  onFinish,
}: {
  barber: BarberView;
  now: number;
  busy: boolean;
  onFinish: () => void;
}) {
  const att = barber.attendance;
  const elapsed = att ? (now - att.startedAt) / 1000 : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid={`demo-working-${barber.displayName}`}>
      <Avatar name={barber.displayName} photoUrl={barber.photoUrl} size={32} />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-bold"
          style={{ color: barber.color ?? '#09090b' }}
        >
          {barber.displayName}
        </div>
        <div className="text-xs text-zinc-400">
          {att ? KIND_LABEL[att.kind] : ''} · <span className="tabular font-semibold text-zinc-700">{formatDuration(elapsed)}</span>
        </div>
      </div>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onFinish}>
        Finalizar
      </Button>
    </div>
  );
}
