import { operation } from '../http';

/** Serviços de ATENDIMENTO: iniciar (rodízio ou escolha específica) e finalizar. */
export const attendanceService = {
  start: (barberId: number) => operation('start', { barberId }),
  startNext: () => operation('start-next', {}),
  finish: (barberId: number, attendanceId?: number) => operation('finish', { barberId, attendanceId }),
};

