import type { Db } from '../database/connection.js';

export interface ShiftRow {
  id: number;
  date: string;
  opened_at: number;
  closed_at: number | null;
  status: 'OPEN' | 'CLOSED';
  close_reason: string | null;
}

export class ShiftRepository {
  constructor(private db: Db) {}

  getOpen(): ShiftRow | undefined {
    return this.db.prepare("SELECT * FROM shifts WHERE status = 'OPEN'").get() as unknown as ShiftRow | undefined;
  }

  countForDate(date: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM shifts WHERE date = ?').get(date) as { n: number };
    return row.n;
  }

  open(date: string, now: number): number {
    const res = this.db
      .prepare("INSERT INTO shifts (date, opened_at, status) VALUES (?, ?, 'OPEN')")
      .run(date, now);
    return Number(res.lastInsertRowid);
  }

  close(id: number, now: number, reason: string): void {
    this.db
      .prepare("UPDATE shifts SET status = 'CLOSED', closed_at = ?, close_reason = ? WHERE id = ?")
      .run(now, reason, id);
  }
}

