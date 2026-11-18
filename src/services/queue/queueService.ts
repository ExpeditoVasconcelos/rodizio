import { operation } from '../http';

/** Serviços de FILA: entrada, pausa, retorno, fim de expediente e desfazer. */
export const queueService = {
  enter: (barberId: number) => operation('enter', { barberId }),
  resume: (barberId: number) => operation('resume', { barberId }),
  pause: (barberId: number) => operation('pause', { barberId }),
  clockOut: (barberId: number) => operation('clock-out', { barberId }),
  undo: (auditId: number) => operation('undo', { auditId }),
};

