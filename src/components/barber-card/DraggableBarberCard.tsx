import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import type { BarberView } from '../../../shared/types';
import { originOf } from '../../domain/board';
import { BarberCardFace, type CardVariant } from './BarberCardFace';
import { cn } from '../ui/Button';

interface Props {
  barber: BarberView;
  variant: CardVariant;
  now: number;
  isNext?: boolean;
  processing?: boolean;
  shaking?: boolean;
  /** Impede o arraste (offline, processando...). */
  disabled?: boolean;
  isDragging?: boolean;
  onMenu?: () => void;
  onQuickEnter?: () => void;
}

export const CARD_TRANSITION = { duration: 0.36, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

/**
 * Cartão arrastável. O próprio elemento permanece na lista (como "fantasma") enquanto o
 * DragOverlay mostra o cartão seguindo o dedo; a mudança de coluna é animada pelo framer-motion
 * (layoutId) somente depois que o servidor confirma a operação.
 */
export function DraggableBarberCard({
  barber,
  variant,
  now,
  isNext,
  processing,
  shaking,
  disabled,
  isDragging,
  onMenu,
  onQuickEnter,
}: Props) {
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `barber-${barber.id}`,
    data: { barberId: barber.id, origin: originOf(barber) },
    disabled: disabled || processing,
  });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      layoutId={`card-${barber.id}`}
      transition={CARD_TRANSITION}
      initial={false}
      className={cn('draggable-card', variant === 'rest' && 'shrink-0')}
      data-testid={`card-${barber.displayName}`}
      data-state={barber.state}
      onContextMenu={(e) => e.preventDefault()}
      {...attributes}
      {...(listeners as object)}
    >
      <div className={cn(shaking && 'animate-shake')}>
        <BarberCardFace
          barber={barber}
          variant={variant}
          now={now}
          isNext={isNext}
          processing={processing}
          ghost={isDragging}
          disabled={disabled}
          onMenu={onMenu}
          onQuickEnter={onQuickEnter}
        />
      </div>
    </motion.div>
  );
}
