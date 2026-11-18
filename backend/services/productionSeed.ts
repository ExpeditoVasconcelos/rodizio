import type { RodizioService } from './rodizioService.js';

export interface InitialCollaborator {
  fullName: string;
  displayName: string;
  color: string;
}

/**
 * Colaboradores iniciais cadastrados automaticamente em produção quando o banco
 * é inicializado pela primeira vez.
 */
export const PRODUCTION_COLLABORATORS: InitialCollaborator[] = [];

export function seedProductionIfEmpty(service: RodizioService): void {
  service.maintain();
  if (service.barbers.list(false).length > 0) return;
  for (const c of PRODUCTION_COLLABORATORS) {
    const created = service.createBarber(
      { fullName: c.fullName, displayName: c.displayName, color: c.color },
      'sistema',
    );
    service.enter(created.id, { actor: 'sistema' });
  }
  if (PRODUCTION_COLLABORATORS.length > 0) {
    service.seal();
  }
}
