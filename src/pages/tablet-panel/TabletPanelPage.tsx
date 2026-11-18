import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { LayoutGroup } from 'framer-motion';
import { Home, Loader2, Lock, Maximize2, Minimize2, RefreshCw, WifiOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiOk, BarberView } from '../../../shared/types';
import { BarberCardFace } from '../../components/barber-card/BarberCardFace';
import { DraggableBarberCard } from '../../components/barber-card/DraggableBarberCard';
import { BarberActionSheet } from '../../components/dashboard/BarberActionSheet';
import { FullscreenGate } from '../../components/dashboard/FullscreenGate';
import { AvailableSheet } from '../../components/dashboard/RestingStrip';
import { UndoPill } from '../../components/dashboard/UndoPill';
import { Header } from '../../components/header/Header';
import { QueueColumn } from '../../components/queue-column/QueueColumn';
import type { DropState } from '../../components/ui/BoardColumn';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { Toasts } from '../../components/ui/Toasts';
import { WorkingColumn } from '../../components/working-column/WorkingColumn';
import { decideDrop, originOf, type Zone } from '../../domain/board';
import { pushToast } from '../../hooks/toasts';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useNow } from '../../hooks/useNow';
import { useOperations } from '../../hooks/useOperations';
import { useRodizio } from '../../hooks/useRodizio';
import { useWakeLock } from '../../hooks/useWakeLock';
import { attendanceService } from '../../services/attendance/attendanceService';
import { queueService } from '../../services/queue/queueService';

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : rectIntersection(args);
};

const ZONE_BY_ID: Record<string, Zone> = { 'zone-queue': 'queue', 'zone-working': 'working' };

/**
 * Painel operacional móvel (tablet/celular): tela em branco em tela cheia contendo
 * apenas as duas tabelas (NA FILA e TRABALHANDO).
 */
export default function TabletPanelPage() {
  const navigate = useNavigate();
  const { snapshot, status, everConnected } = useRodizio();
  const now = useNow();
  const fs = useFullscreen();
  const ops = useOperations();
  useWakeLock(true);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [overZone, setOverZone] = useState<Zone | null>(null);
  const [skipDropAnimation, setSkipDropAnimation] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [panelMenu, setPanelMenu] = useState(false);
  const [availableOpen, setAvailableOpen] = useState(false);
  const [gateDismissed, setGateDismissed] = useState(() => sessionStorage.getItem('rodizio.gate.ok') === '1');
  const [wantFullscreen, setWantFullscreen] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 10 } }),
  );

  const barbers = snapshot?.barbers ?? [];
  const queue = useMemo(() => barbers.filter((b) => b.state === 'APTO'), [barbers]);
  const working = useMemo(() => barbers.filter((b) => b.state === 'TRABALHANDO'), [barbers]);
  const resting = useMemo(() => barbers.filter((b) => b.state === 'PAUSA' || b.state === 'FORA'), [barbers]);
  const byId = useMemo(() => new Map(barbers.map((b) => [b.id, b])), [barbers]);

  const offline = status !== 'online';
  const shiftClosed = !!snapshot && !snapshot.shift;
  const locked = offline || shiftClosed || !snapshot;
  const active = activeId !== null ? byId.get(activeId) ?? null : null;

  const run = useCallback((id: number, fn: () => Promise<ApiOk>) => void ops.run(id, fn), [ops]);

  /* ----------------------------- arrastar e soltar ----------------------------- */

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(Number(e.active.data.current?.barberId));
    setSkipDropAnimation(false);
  };
  const onDragOver = (e: DragOverEvent) => setOverZone(e.over ? ZONE_BY_ID[String(e.over.id)] ?? null : null);
  const reset = () => {
    setActiveId(null);
    setOverZone(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const barber = byId.get(Number(e.active.data.current?.barberId));
    const zone = e.over ? ZONE_BY_ID[String(e.over.id)] : undefined;
    reset();
    if (!barber || !zone) return;
    if (locked) {
      pushToast('error', 'NÃO FOI POSSÍVEL CONFIRMAR A MOVIMENTAÇÃO.');
      return;
    }
    const decision = decideDrop(barber, zone);
    switch (decision.action) {
      case 'start':
        setSkipDropAnimation(true);
        run(barber.id, () => attendanceService.start(barber.id));
        break;
      case 'finish':
        setSkipDropAnimation(true);
        run(barber.id, () => attendanceService.finish(barber.id, barber.attendance?.id));
        break;
      case 'enter':
        setSkipDropAnimation(true);
        run(barber.id, () => queueService.enter(barber.id));
        break;
      case 'resume':
        setSkipDropAnimation(true);
        run(barber.id, () => queueService.resume(barber.id));
        break;
      case 'invalid':
        pushToast('error', decision.message ?? 'MOVIMENTO NÃO PERMITIDO.');
        break;
      default:
        break;
    }
  };

  const dropStateFor = (zone: Zone): DropState => {
    if (!active) return 'idle';
    const d = decideDrop(active, zone);
    const isOver = overZone === zone;
    if (d.action === 'noop') return 'idle';
    if (d.action === 'invalid') return isOver ? 'over-invalid' : 'idle';
    return isOver ? 'over-valid' : 'accepting';
  };

  const dropMessage = (zone: Zone): string => {
    if (!active) return '';
    const d = decideDrop(active, zone);
    if (d.action === 'invalid') return d.message ?? 'Movimento não permitido';
    if (zone === 'working') {
      return active.position === 1 ? 'Solte para iniciar (Rodízio)' : 'Solte para iniciar (Preferência)';
    }
    return originOf(active) === 'working'
      ? 'Solte para finalizar (volta ao fim da fila)'
      : 'Solte para entrar no fim da fila';
  };

  /* -------------------------------- tela cheia -------------------------------- */

  const dismissGate = () => {
    sessionStorage.setItem('rodizio.gate.ok', '1');
    setGateDismissed(true);
  };

  const enterFullscreen = async () => {
    const ok = await fs.enter();
    setWantFullscreen(ok);
    dismissGate();
  };

  const toggleFullscreen = async () => {
    if (fs.isFullscreen) {
      setWantFullscreen(false);
      await fs.exit();
    } else {
      setWantFullscreen(await fs.enter());
    }
  };

  const fullscreenLost = wantFullscreen && !fs.isFullscreen;
  const showGate = !fs.isFullscreen && !gateDismissed && !fullscreenLost;

  const card = (b: BarberView, variant: 'queue' | 'working') => (
    <DraggableBarberCard
      key={b.id}
      barber={b}
      variant={variant}
      now={now}
      isNext={variant === 'queue' && b.position === 1}
      processing={ops.pending.has(b.id)}
      shaking={ops.shaking === b.id}
      disabled={locked}
      isDragging={activeId === b.id}
      onMenu={() => setMenuId(b.id)}
    />
  );

  return (
    <div className="no-select flex h-dvh w-full flex-col overflow-hidden bg-white text-zinc-900">
      <Header
        snapshot={snapshot}
        status={status}
        now={now}
        isFullscreen={fs.isFullscreen}
        fullscreenSupported={fs.isSupported}
        restingCount={resting.length}
        disabled={locked}
        onOpenAvailable={() => setAvailableOpen(true)}
        onToggleFullscreen={toggleFullscreen}
        onMenu={() => setPanelMenu(true)}
      />

      {offline && (
        <div
          className="flex items-center justify-center gap-2 border-b border-zinc-200 bg-zinc-900 px-4 py-2 text-xs font-semibold text-white"
          role="alert"
          data-testid="offline-banner"
        >
          {everConnected ? <WifiOff size={15} /> : <Loader2 size={15} className="animate-spin" />}
          {everConnected ? 'CONEXÃO PERDIDA — AGUARDANDO RECONEXÃO.' : 'CONECTANDO AO SERVIDOR…'}
        </div>
      )}
      {!offline && shiftClosed && (
        <div
          className="flex items-center justify-center gap-2 border-b border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700"
          role="alert"
        >
          <Lock size={14} />
          TURNO ENCERRADO — A RECEPÇÃO PRECISA ABRIR UM NOVO TURNO.
        </div>
      )}
      {fullscreenLost && (
        <button
          onClick={toggleFullscreen}
          className="flex items-center justify-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          data-testid="resume-fullscreen"
        >
          <Maximize2 size={13} /> Tela cheia encerrada — toque para voltar
        </button>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        <LayoutGroup>
          {activeId === null && <UndoPill undo={snapshot?.undo ?? null} now={now} />}

          {/* As duas tabelas ocupam toda a área disponível da tela em branco */}
          <main className="relative flex min-h-0 flex-1 gap-3 p-3 portrait:flex-col">
            <QueueColumn count={queue.length} dropState={dropStateFor('queue')} dropMessage={dropMessage('queue')}>
              {queue.map((b) => card(b, 'queue'))}
            </QueueColumn>
            <WorkingColumn
              count={working.length}
              dropState={dropStateFor('working')}
              dropMessage={dropMessage('working')}
            >
              {working.map((b) => card(b, 'working'))}
            </WorkingColumn>
          </main>
        </LayoutGroup>

        <DragOverlay
          dropAnimation={skipDropAnimation ? null : { duration: 220, easing: 'cubic-bezier(0.22,1,0.36,1)' }}
          zIndex={100}
        >
          {active ? (
            <BarberCardFace
              barber={active}
              variant={originOf(active) === 'rest' ? 'rest' : originOf(active)}
              now={now}
              isNext={active.position === 1}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <AvailableSheet
        open={availableOpen}
        onClose={() => setAvailableOpen(false)}
        barbers={resting}
        pending={ops.pending}
        disabled={locked}
        onRun={run}
      />

      <BarberActionSheet
        barber={menuId !== null ? byId.get(menuId) ?? null : null}
        onClose={() => setMenuId(null)}
        onRun={run}
      />

      <Sheet
        open={panelMenu}
        onClose={() => setPanelMenu(false)}
        title={<h3 className="text-base font-bold text-zinc-900">Opções do painel</h3>}
      >
        <div className="flex flex-col gap-2">
          {fs.isSupported && (
            <Button
              size="md"
              variant="primary"
              icon={fs.isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              onClick={() => {
                setPanelMenu(false);
                void toggleFullscreen();
              }}
            >
              {fs.isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
            </Button>
          )}
          <ThemeToggle showLabel className="w-full justify-center border border-zinc-300 py-2.5" />
          <Button size="md" variant="secondary" icon={<RefreshCw size={16} />} onClick={() => location.reload()}>
            Recarregar painel
          </Button>
          <Button size="md" variant="ghost" icon={<Home size={16} />} onClick={() => navigate('/')}>
            Tela inicial
          </Button>
        </div>
      </Sheet>

      {showGate && (
        <FullscreenGate
          supported={fs.isSupported}
          logoUrl={snapshot?.shop.logoUrl}
          onEnter={enterFullscreen}
          onSkip={dismissGate}
        />
      )}
      <Toasts />
    </div>
  );
}
