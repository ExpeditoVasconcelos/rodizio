import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { cn } from './Button';

export type DropState = 'idle' | 'accepting' | 'over-valid' | 'over-invalid';

interface Props {
  zoneId: string;
  title: string;
  subtitle: string;
  count: number;
  accent: 'queue' | 'work';
  dropState: DropState;
  dropMessage: string;
  emptyMessage: ReactNode;
  children: ReactNode;
}

/**
 * Quadro/tabela minimalista sobre tela branca.
 * Apenas um detalhe mínimo de cor no indicador do quadro, mantendo o restante em preto, branco e cinza frio.
 */
export function BoardColumn({
  zoneId,
  title,
  subtitle,
  count,
  accent,
  dropState,
  dropMessage,
  emptyMessage,
  children,
}: Props) {
  const { setNodeRef } = useDroppable({ id: zoneId });
  const dotColor = accent === 'queue' ? '#0d9488' : '#d97706';

  return (
    <section
      ref={setNodeRef}
      data-testid={zoneId}
      data-drop-state={dropState}
      aria-label={title}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white transition-colors duration-150',
        dropState === 'idle' && 'border-zinc-200',
        dropState === 'accepting' && 'border-dashed border-zinc-400 bg-zinc-50/50',
        dropState === 'over-valid' && 'border-zinc-900 bg-zinc-50',
        dropState === 'over-invalid' && 'border-zinc-400 bg-zinc-100/60',
      )}
    >
      {/* Filete superior mínimo de identificação do quadro */}
      <div className="h-[2px] w-full shrink-0" style={{ backgroundColor: dotColor }} />

      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
          <h2 className="text-xs font-bold tracking-[0.14em] text-zinc-900 uppercase">{title}</h2>
          <span className="hidden text-xs text-zinc-400 sm:inline">· {subtitle}</span>
        </div>
        <span className="tabular rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
          {count}
        </span>
      </header>

      <div className="scroll-y min-h-0 flex-1 p-3">
        {count === 0 ? (
          <div className="grid h-full min-h-36 place-items-center rounded-lg border border-dashed border-zinc-200 p-6 text-center text-xs font-medium text-zinc-400">
            {emptyMessage}
          </div>
        ) : (
          <div className="flex flex-col gap-2">{children}</div>
        )}
      </div>

      {(dropState === 'over-valid' || dropState === 'over-invalid') && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="animate-slide-up rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold tracking-wider text-white shadow-md">
            {dropMessage}
          </div>
        </div>
      )}
    </section>
  );
}
