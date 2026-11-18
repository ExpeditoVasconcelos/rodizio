import { openDatabase } from '../database/connection.js';
import { RodizioService } from '../services/rodizioService.js';

export function makeService(opts: { file?: string; clock?: { t: number } } = {}) {
  const clock = opts.clock ?? { t: new Date(2026, 10, 16, 9, 0, 0).getTime() };
  const db = openDatabase(opts.file ?? ':memory:');
  const svc = new RodizioService(db, {
    mode: 'real',
    clock: () => clock.t,
    settings: () => ({ shopName: 'Teste', logoUrl: null, undoWindowSeconds: 60 }),
  });
  svc.maintain();
  return { svc, clock };
}

const NAMES = ['João', 'Carlos', 'Pedro', 'Marcos', 'Rafael', 'Lucas'];

export function seedBarbers(svc: RodizioService, count = 4): number[] {
  return NAMES.slice(0, count).map(
    (n) => svc.createBarber({ fullName: n, displayName: n, color: null }, 'teste').id,
  );
}

export function queueNames(svc: RodizioService): string[] {
  return svc
    .snapshot()
    .barbers.filter((b) => b.state === 'APTO')
    .sort((a, b) => a.position! - b.position!)
    .map((b) => b.displayName);
}

export function workingNames(svc: RodizioService): string[] {
  return svc
    .snapshot()
    .barbers.filter((b) => b.state === 'TRABALHANDO')
    .map((b) => b.displayName);
}

