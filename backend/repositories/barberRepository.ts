import type { Db } from '../database/connection.js';

export interface BarberRow {
  id: number;
  full_name: string;
  display_name: string;
  photo: string | null;
  color: string | null;
  active: number;
  rest_state: 'OFF' | 'PAUSED';
  created_at: number;
  updated_at: number;
}

export interface BarberInput {
  fullName: string;
  displayName: string;
  color: string | null;
}

export class BarberRepository {
  constructor(private db: Db) {}

  get(id: number): BarberRow | undefined {
    return this.db.prepare('SELECT * FROM barbers WHERE id = ?').get(id) as unknown as BarberRow | undefined;
  }

  list(onlyActive = false): BarberRow[] {
    const sql = onlyActive
      ? 'SELECT * FROM barbers WHERE active = 1 ORDER BY display_name COLLATE NOCASE, id'
      : 'SELECT * FROM barbers ORDER BY active DESC, display_name COLLATE NOCASE, id';
    return this.db.prepare(sql).all() as unknown as BarberRow[];
  }

  insert(input: BarberInput, now: number): number {
    const res = this.db
      .prepare(
        `INSERT INTO barbers (full_name, display_name, color, active, rest_state, created_at, updated_at)
         VALUES (?, ?, ?, 1, 'OFF', ?, ?)`,
      )
      .run(input.fullName, input.displayName, input.color, now, now);
    return Number(res.lastInsertRowid);
  }

  update(id: number, input: BarberInput, now: number): void {
    this.db
      .prepare('UPDATE barbers SET full_name = ?, display_name = ?, color = ?, updated_at = ? WHERE id = ?')
      .run(input.fullName, input.displayName, input.color, now, id);
  }

  setPhoto(id: number, photo: string | null, now: number): void {
    this.db.prepare('UPDATE barbers SET photo = ?, updated_at = ? WHERE id = ?').run(photo, now, id);
  }

  setActive(id: number, active: boolean, now: number): void {
    this.db.prepare('UPDATE barbers SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, now, id);
  }

  setRestState(id: number, state: 'OFF' | 'PAUSED', now: number): void {
    this.db.prepare('UPDATE barbers SET rest_state = ?, updated_at = ? WHERE id = ?').run(state, now, id);
  }

  resetAllRest(now: number): void {
    this.db.prepare("UPDATE barbers SET rest_state = 'OFF', updated_at = ?").run(now);
  }
}

