import type { ConnectionStatus } from '../../services/connection/store';
import { cn } from './Button';

const CFG: Record<ConnectionStatus, { label: string; dot: string }> = {
  online: { label: 'Sincronizado', dot: 'bg-zinc-900' },
  connecting: { label: 'Conectando…', dot: 'bg-zinc-400 animate-pulse' },
  offline: { label: 'Sem conexão', dot: 'bg-zinc-400' },
};

export function ConnectionBadge({ status, compact }: { status: ConnectionStatus; compact?: boolean }) {
  const c = CFG[status];
  return (
    <div
      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"
      role="status"
      title={c.label}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {!compact && <span>{c.label}</span>}
    </div>
  );
}
