import type { BarberView } from '../../shared/types';

/** Regras de apresentação do quadro (a regra de negócio oficial fica no servidor). */
export type Zone = 'queue' | 'working';
export type Origin = 'queue' | 'working' | 'rest';

export interface DropDecision {
  action: 'start' | 'finish' | 'enter' | 'resume' | 'noop' | 'invalid';
  message?: string;
}

export function originOf(barber: BarberView): Origin {
  if (barber.state === 'APTO') return 'queue';
  if (barber.state === 'TRABALHANDO') return 'working';
  return 'rest';
}

/** Decide o que a soltura de um cartão em uma zona significa. */
export function decideDrop(barber: BarberView, zone: Zone): DropDecision {
  const origin = originOf(barber);
  if (origin === 'queue' && zone === 'working') return { action: 'start' };
  if (origin === 'working' && zone === 'queue') return { action: 'finish' };
  if (origin === 'rest' && zone === 'queue') {
    return { action: barber.state === 'PAUSA' ? 'resume' : 'enter' };
  }
  if (origin === 'rest' && zone === 'working') {
    return { action: 'invalid', message: 'ENTRE NA FILA ANTES DE INICIAR UM ATENDIMENTO.' };
  }
  if (origin === 'queue' && zone === 'queue') {
    return { action: 'invalid', message: 'A ORDEM DA FILA É DEFINIDA PELO RODÍZIO.' };
  }
  return { action: 'noop' };
}

/** A zona aceita o cartão arrastado? (para destacar áreas durante o arraste) */
export function zoneAccepts(barber: BarberView, zone: Zone): boolean {
  const a = decideDrop(barber, zone).action;
  return a === 'start' || a === 'finish' || a === 'enter' || a === 'resume';
}
