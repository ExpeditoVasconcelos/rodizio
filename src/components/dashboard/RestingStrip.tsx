import type { ApiOk, BarberView } from '../../../shared/types';
import { queueService } from '../../services/queue/queueService';
import { Avatar } from '../ui/Avatar';
import { Sheet } from '../ui/Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  barbers: BarberView[];
  pending: ReadonlySet<number>;
  disabled: boolean;
  onRun: (barberId: number, fn: () => Promise<ApiOk>) => void;
}

/** Modal minimalista para o barbeiro entrar no final da fila ("Estou disponível"). */
export function AvailableSheet({ open, onClose, barbers, pending, disabled, onRun }: Props) {
  const quickEnter = (b: BarberView) => {
    onRun(b.id, () => (b.state === 'PAUSA' ? queueService.resume(b.id) : queueService.enter(b.id)));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div>
          <div className="text-base font-bold text-zinc-900">Estou disponível</div>
          <p className="text-xs text-zinc-500">Selecione seu nome para entrar no final da fila.</p>
        </div>
      }
    >
      {barbers.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">
          Todos os profissionais ativos já estão na fila ou em atendimento.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {barbers.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={disabled || pending.has(b.id)}
              onClick={() => {
                onClose();
                quickEnter(b);
              }}
              data-testid={`modal-enter-${b.displayName}`}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-900 active:bg-zinc-50"
            >
              <Avatar name={b.displayName} photoUrl={b.photoUrl} size={40} />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-base font-bold"
                  style={{ color: b.color ?? '#09090b' }}
                >
                  {b.displayName}
                </div>
                <div className="text-[0.68rem] font-medium text-zinc-400">
                  {b.state === 'PAUSA' ? 'Em pausa · Voltar à fila' : 'Entrar no final da fila'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
