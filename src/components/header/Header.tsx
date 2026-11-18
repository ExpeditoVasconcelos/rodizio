import { Maximize2, Menu, Minimize2, Plus } from 'lucide-react';
import type { StateSnapshot } from '../../../shared/types';
import { formatClock } from '../../domain/format';
import type { ConnectionStatus } from '../../services/connection/store';
import { ConnectionBadge } from '../ui/ConnectionBadge';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';

interface Props {
  snapshot: StateSnapshot | null;
  status: ConnectionStatus;
  now: number;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  restingCount: number;
  disabled: boolean;
  onOpenAvailable: () => void;
  onToggleFullscreen: () => void;
  onMenu: () => void;
}

/** Barra superior mínima: logo Barba de Urso, alternância de tema (escuro/claro) e controles essenciais. */
export function Header({
  snapshot,
  status,
  now,
  isFullscreen,
  fullscreenSupported,
  restingCount,
  disabled,
  onOpenAvailable,
  onToggleFullscreen,
  onMenu,
}: Props) {
  const iconBtn =
    'grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900';

  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b border-zinc-200 bg-white px-4 py-2">
      <Logo url={snapshot?.shop.logoUrl} size={26} />
      <div className="truncate text-xs font-bold tracking-[0.14em] text-zinc-900 uppercase">
        {snapshot?.shop.name ?? 'BARBA DE URSO'}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        disabled={disabled}
        onClick={onOpenAvailable}
        data-testid="btn-estou-disponivel"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40"
      >
        <Plus size={14} />
        <span>Disponível</span>
        {restingCount > 0 && (
          <span className="tabular rounded bg-zinc-100 px-1.5 py-0.2 text-[0.65rem] text-zinc-600">
            {restingCount}
          </span>
        )}
      </button>

      <ConnectionBadge status={status} compact />

      <div className="tabular text-xs font-semibold text-zinc-500" data-testid="clock">
        {formatClock(now)}
      </div>

      <ThemeToggle />

      {fullscreenSupported && (
        <button
          className={iconBtn}
          onClick={onToggleFullscreen}
          data-testid="toggle-fullscreen"
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
      <button className={iconBtn} onClick={onMenu} aria-label="Menu do painel" data-testid="panel-menu-btn">
        <Menu size={16} />
      </button>
    </header>
  );
}
