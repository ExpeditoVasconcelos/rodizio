import type { RodizioService } from './rodizioService.js';

export const DEMO_BARBERS: { name: string; color: string }[] = [
  { name: 'João', color: '#3b82f6' },
  { name: 'Carlos', color: '#10b981' },
  { name: 'Pedro', color: '#f59e0b' },
  { name: 'Marcos', color: '#f43f5e' },
  { name: 'Rafael', color: '#8b5cf6' },
  { name: 'Lucas', color: '#22c55e' },
];

/**
 * Estado inicial da demonstração:
 * João, Carlos, Pedro e Marcos na fila (nessa ordem); Rafael em PAUSA; Lucas FORA DO EXPEDIENTE.
 */
export function seedDemo(service: RodizioService): void {
  service.maintain();
  const ids: number[] = [];
  for (const b of DEMO_BARBERS) {
    ids.push(service.createBarber({ fullName: b.name, displayName: b.name, color: b.color }, 'demo').id);
  }
  const [joao, carlos, pedro, marcos, rafael] = ids;
  for (const id of [joao, carlos, pedro, marcos]) service.enter(id, { actor: 'demo' });
  service.enter(rafael, { actor: 'demo' });
  service.pause(rafael, { actor: 'demo' });
  service.seal();
}
