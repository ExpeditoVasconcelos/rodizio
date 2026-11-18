import { GripVertical, Loader2, MoreHorizontal } from 'lucide-react';
import type { BarberView } from '../../../shared/types';
import { formatClock, formatDuration, KIND_LABEL } from '../../domain/format';
import { Avatar } from '../ui/Avatar';
import { cn } from '../ui/Button';

export type CardVariant = 'queue' | 'working' | 'rest';

interface FaceProps {
  barber: BarberView;
  variant: CardVariant;
  now: number;
  isNext?: boolean;
  processing?: boolean;
  ghost?: boolean;
  overlay?: boolean;
  disabled?: boolean;
  onMenu?: () => void;
  onQuickEnter?: () => void;
}

/**
 * Linha/card minimalista da tabela: fundo branco, tipografia em escala de cinza
 * e apenas o nome do barbeiro colorido com sua cor de identificação.
 */
export function BarberCardFace({
  barber,
  variant,
  now,
  isNext,
  processing,
  ghost,
  overlay,
  disabled,
  onMenu,
  onQuickEnter,
}: FaceProps) {
  if (variant === 'rest') {
    return <RestFace {...{ barber, processing, ghost, overlay, disabled, onMenu, onQuickEnter }} />;
  }

  const wait = barber.queueEnteredAt ? (now - barber.queueEnteredAt) / 1000 : 0;
  const att = barber.attendance;
  const elapsed = att ? (now - att.startedAt) / 1000 : 0;
  const nameColor = barber.color ?? '#09090b';

  return (
    <div
      className={cn(
        'no-select relative flex min-h-[4.5rem] items-center gap-3 rounded-lg border bg-white px-3.5 py-3 transition-all duration-150',
        isNext && variant === 'queue' ? 'border-zinc-900 bg-zinc-50/60' : 'border-zinc-200 hover:border-zinc-300',
        ghost && 'opacity-25',
        overlay && 'scale-[1.02] border-zinc-900 bg-white shadow-xl',
        disabled && !processing && 'opacity-55',
      )}
    >
      <GripVertical size={18} className="shrink-0 text-zinc-300" aria-hidden />

      {variant === 'queue' && barber.position !== null && (
        <div
          className={cn(
            'tabular grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold',
            isNext ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600',
          )}
          aria-label={`Posição ${barber.position}`}
        >
          {barber.position}º
        </div>
      )}

      <Avatar name={barber.displayName} photoUrl={barber.photoUrl} size={38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {barber.color && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: barber.color }} />
          )}
          <div
            className="truncate text-lg font-bold leading-tight tracking-tight"
            style={{ color: nameColor }}
          >
            {barber.displayName}
          </div>
          {variant === 'queue' && isNext && (
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-white uppercase">
              PRÓXIMO A ATENDER
            </span>
          )}
        </div>

        {variant === 'queue' ? (
          <div className="mt-0.5 text-xs text-zinc-400">
            Fila · <span className="tabular font-medium text-zinc-600">{formatDuration(wait)}</span>
          </div>
        ) : (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
            {att && <span className="font-medium text-zinc-600">{KIND_LABEL[att.kind]}</span>}
            <span>·</span>
            <span>
              Início <span className="tabular text-zinc-600">{att ? formatClock(att.startedAt) : '--:--'}</span>
            </span>
          </div>
        )}
      </div>

      {variant === 'working' && (
        <div className="shrink-0 text-right">
          <div className="tabular text-base font-bold text-zinc-900">{formatDuration(elapsed)}</div>
          <div className="text-[0.62rem] font-medium tracking-wider text-zinc-400 uppercase">Atendendo</div>
        </div>
      )}

      {onMenu && <MenuButton onMenu={onMenu} disabled={disabled} />}
      {processing && <ProcessingOverlay />}
    </div>
  );
}

function RestFace({
  barber,
  processing,
  ghost,
  overlay,
  disabled,
  onMenu,
  onQuickEnter,
}: Omit<FaceProps, 'variant' | 'now'>) {
  const paused = barber.state === 'PAUSA';
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      className={cn(
        'no-select relative flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 transition',
        ghost && 'opacity-30',
        overlay && 'scale-105 border-zinc-900 shadow-lg',
        disabled && !processing && 'opacity-55',
      )}
    >
      <span
        className="truncate text-sm font-semibold"
        style={{ color: barber.color ?? '#09090b' }}
      >
        {barber.displayName}
      </span>
      <span className="text-[0.65rem] font-medium text-zinc-400">
        {paused ? 'Pausa' : 'Fora'}
      </span>

      {onQuickEnter && (
        <button
          type="button"
          disabled={disabled}
          onMouseDown={stop}
          onTouchStart={stop}
          onPointerDown={stop}
          onClick={onQuickEnter}
          data-testid={`quick-enter-${barber.displayName}`}
          className="rounded bg-zinc-900 px-2 py-0.5 text-[0.65rem] font-medium text-white hover:bg-zinc-700"
        >
          Entrar
        </button>
      )}

      {onMenu && <MenuButton onMenu={onMenu} disabled={disabled} small />}
      {processing && <ProcessingOverlay />}
    </div>
  );
}

function MenuButton({ onMenu, disabled, small }: { onMenu: () => void; disabled?: boolean; small?: boolean }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <button
      type="button"
      aria-label="Opções"
      disabled={disabled}
      onMouseDown={stop}
      onTouchStart={stop}
      onPointerDown={stop}
      onClick={onMenu}
      className={cn(
        'grid shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900',
        small ? 'h-7 w-7' : 'h-8 w-8',
      )}
    >
      <MoreHorizontal size={small ? 15 : 18} />
    </button>
  );
}

function ProcessingOverlay() {
  return (
    <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/85">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
        <Loader2 className="animate-spin" size={15} />
        Confirmando…
      </div>
    </div>
  );
}
