import type { BarberState, AttendanceKind } from '../../shared/types.js';

/** Início do "dia de trabalho": antes desta hora, ainda pertencemos ao turno do dia anterior. */
export const DAY_START_HOUR = 4;

/** Data local (YYYY-MM-DD) do turno a que pertence o instante `ms`. */
export function shiftDateOf(ms: number): string {
  const d = new Date(ms - DAY_START_HOUR * 3600_000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Estado operacional do profissional. Derivado dos registros reais:
 * atendimento em andamento > entrada na fila > estado de repouso (pausa / fora).
 */
export function deriveState(input: {
  hasActiveAttendance: boolean;
  isWaiting: boolean;
  restState: 'OFF' | 'PAUSED';
}): BarberState {
  if (input.hasActiveAttendance) return 'TRABALHANDO';
  if (input.isWaiting) return 'APTO';
  return input.restState === 'PAUSED' ? 'PAUSA' : 'FORA';
}

/**
 * Regra do rodízio: quem está em 1º lugar é atendimento "pelo rodízio";
 * qualquer outra posição é uma escolha específica do cliente.
 */
export function kindForPosition(position: number): AttendanceKind {
  return position === 1 ? 'ROTATION' : 'SPECIFIC';
}

