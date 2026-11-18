import type { RodizioService } from './rodizioService.js';

export const INITIAL_COLLABORATORS = [
  'Severino',
  'Bruno',
  'Felipe',
  'Calvinho',
  'Israel',
  'Mateus',
  'Izaiane',
  'Daniel',
  'Gerson',
  'Tainãn',
  'Carlos',
  'Raul',
  'Diogo',
] as const;

export const INITIAL_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#8b5cf6',
  '#22c55e',
  '#06b6d4',
  '#f97316',
  '#6366f1',
  '#ec4899',
] as const;

/**
 * Cadastra os 13 colaboradores iniciais da Barba de Urso caso o banco ainda esteja vazio.
 * Executado tanto no servidor local quanto na Serverless Function da Vercel.
 */
export function seedProductionIfEmpty(service: RodizioService): void {
  service.maintain();
  if (service.barbers.list(false).length > 0) return;
  INITIAL_COLLABORATORS.forEach((name, idx) => {
    service.createBarber(
      {
        fullName: name,
        displayName: name,
        color: INITIAL_COLORS[idx % INITIAL_COLORS.length],
      },
      'sistema',
    );
  });
  service.seal();
}
