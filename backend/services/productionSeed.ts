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
 * Garante que os 13 colaboradores oficiais da Barba de Urso estejam devidamente
 * cadastrados e integrados ao rodízio de produção (tanto local quanto Vercel Serverless).
 */
export function seedProductionIfEmpty(service: RodizioService): void {
  service.maintain();

  const existing = service.barbers.list(false);
  const existingMap = new Map(
    existing.map((b) => [b.display_name.trim().toLowerCase(), b]),
  );

  let createdAny = false;
  INITIAL_COLLABORATORS.forEach((name, idx) => {
    const key = name.trim().toLowerCase();
    if (!existingMap.has(key)) {
      service.createBarber(
        {
          fullName: name,
          displayName: name,
          color: INITIAL_COLORS[idx % INITIAL_COLORS.length],
        },
        'sistema',
      );
      createdAny = true;
    }
  });

  // Se a fila estiver vazia no turno aberto atual, coloca os colaboradores na fila de espera
  const openShift = service.shifts.getOpen();
  if (openShift && service.queue.waiting(openShift.id).length === 0) {
    const updated = service.barbers.list(false);
    const byName = new Map(
      updated.map((b) => [b.display_name.trim().toLowerCase(), b]),
    );

    for (const name of INITIAL_COLLABORATORS) {
      const barber = byName.get(name.trim().toLowerCase());
      if (barber && barber.active && service.stateOf(barber) === 'FORA') {
        try {
          service.enter(barber.id, { actor: 'sistema' });
          createdAny = true;
        } catch {
          /* ignora se já estiver na fila ou em atendimento */
        }
      }
    }
  }

  if (createdAny) {
    service.seal();
  }
}
