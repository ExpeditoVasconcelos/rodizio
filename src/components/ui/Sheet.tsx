import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  placement?: 'bottom' | 'center';
  className?: string;
}

export function Sheet({ open, onClose, title, children, placement = 'bottom', className }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={cn(
        'fixed inset-0 z-[70] flex bg-black/50 backdrop-blur-[2px]',
        placement === 'bottom' ? 'items-end justify-center' : 'items-end justify-center p-0 sm:items-center sm:p-4',
      )}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-slide-up max-h-[90dvh] w-full overflow-y-auto border border-zinc-200 bg-white text-zinc-900 shadow-xl',
          placement === 'bottom'
            ? 'max-w-lg rounded-t-2xl p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))]'
            : 'max-w-lg rounded-t-2xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
