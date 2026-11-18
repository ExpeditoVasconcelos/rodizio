import { LogOut, Pause, Play, Scissors, Undo2, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ApiOk, BarberView } from '../../../shared/types';
import { STATE_LABEL } from '../../domain/format';
import { attendanceService } from '../../services/attendance/attendanceService';
import { queueService } from '../../services/queue/queueService';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

interface Props {
  barber: BarberView | null;
  onClose: () => void;
  onRun: (barberId: number, fn: () => Promise<ApiOk>) => void;
}

/** Ações secundárias por toque sobre fundo branco minimalista. */
export function BarberActionSheet({ barber, onClose, onRun }: Props) {
  const go = (fn: () => Promise<ApiOk>) => {
    if (!barber) return;
    onClose();
    onRun(barber.id, fn);
  };

  let actions: ReactNode = null;
  if (barber) {
    const id = barber.id;
    switch (barber.state) {
      case 'APTO':
        actions = (
          <>
            <Button size="lg" variant="primary" icon={<Play size={18} />} onClick={() => go(() => attendanceService.start(id))}>
              Iniciar atendimento
            </Button>
            <Button size="md" variant="secondary" icon={<Pause size={16} />} onClick={() => go(() => queueService.pause(id))}>
              Colocar em pausa
            </Button>
            <Button size="md" variant="ghost" icon={<LogOut size={16} />} onClick={() => go(() => queueService.clockOut(id))}>
              Encerrar expediente
            </Button>
          </>
        );
        break;
      case 'TRABALHANDO':
        actions = (
          <Button
            size="lg"
            variant="primary"
            icon={<Undo2 size={18} />}
            onClick={() => go(() => attendanceService.finish(id, barber.attendance?.id))}
          >
            Finalizar atendimento
          </Button>
        );
        break;
      case 'PAUSA':
        actions = (
          <>
            <Button size="lg" variant="primary" icon={<UserPlus size={18} />} onClick={() => go(() => queueService.resume(id))}>
              Voltar para a fila
            </Button>
            <Button size="md" variant="ghost" icon={<LogOut size={16} />} onClick={() => go(() => queueService.clockOut(id))}>
              Encerrar expediente
            </Button>
          </>
        );
        break;
      case 'FORA':
        actions = (
          <Button size="lg" variant="primary" icon={<Scissors size={18} />} onClick={() => go(() => queueService.enter(id))}>
            Estou disponível
          </Button>
        );
        break;
    }
  }

  return (
    <Sheet
      open={!!barber}
      onClose={onClose}
      title={
        barber && (
          <div className="flex items-center gap-3">
            <Avatar name={barber.displayName} photoUrl={barber.photoUrl} size={42} />
            <div>
              <div
                className="text-lg font-bold leading-tight"
                style={{ color: barber.color ?? '#09090b' }}
              >
                {barber.displayName}
              </div>
              <div className="text-xs font-medium text-zinc-400">{STATE_LABEL[barber.state]}</div>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-2">{actions}</div>
    </Sheet>
  );
}
