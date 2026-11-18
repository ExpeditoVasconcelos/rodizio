import type { Db } from '../database/connection.js';
import type { AttendanceKind, AttendanceStatus } from '../../shared/types.js';

export interface AttendanceDbRow {
  id: number;
  barber_id: number;
  shift_id: number;
  kind: AttendanceKind;
  queue_position: number | null;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  status: AttendanceStatus;
  source: string | null;
}

export interface HistoryFilter {
  from?: number;
  to?: number;
  barberId?: number;
  limit: number;
  offset: number;
}

export class AttendanceRepository {
  constructor(private db: Db) {}

  get(id: number): AttendanceDbRow | undefined {
    return this.db.prepare('SELECT * FROM attendances WHERE id = ?').get(id) as unknown as
      | AttendanceDbRow
      | undefined;
  }

  activeFor(barberId: number): AttendanceDbRow | undefined {
    return this.db
      .prepare("SELECT * FROM attendances WHERE barber_id = ? AND status = 'IN_PROGRESS'")
      .get(barberId) as unknown as AttendanceDbRow | undefined;
  }

  allActive(): AttendanceDbRow[] {
    return this.db
      .prepare("SELECT * FROM attendances WHERE status = 'IN_PROGRESS' ORDER BY started_at, id")
      .all() as unknown as AttendanceDbRow[];
  }

  start(
    barberId: number,
    shiftId: number,
    kind: AttendanceKind,
    position: number,
    now: number,
    source: string,
  ): number {
    const res = this.db
      .prepare(
        `INSERT INTO attendances (barber_id, shift_id, kind, queue_position, started_at, status, source)
         VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?)`,
      )
      .run(barberId, shiftId, kind, position, now, source);
    return Number(res.lastInsertRowid);
  }

  finish(id: number, status: 'FINISHED' | 'CLOSED_BY_SHIFT', now: number, durationSeconds: number): void {
    this.db
      .prepare('UPDATE attendances SET status = ?, ended_at = ?, duration_seconds = ? WHERE id = ?')
      .run(status, now, durationSeconds, id);
  }

  cancel(id: number, now: number): void {
    this.db
      .prepare("UPDATE attendances SET status = 'CANCELLED', ended_at = ?, duration_seconds = NULL WHERE id = ?")
      .run(now, id);
  }

  reopen(id: number): void {
    this.db
      .prepare("UPDATE attendances SET status = 'IN_PROGRESS', ended_at = NULL, duration_seconds = NULL WHERE id = ?")
      .run(id);
  }

  /** Média e quantidade de atendimentos finalizados no turno. */
  shiftStats(shiftId: number): { completed: number; avg: number | null } {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n, AVG(duration_seconds) AS avg FROM attendances WHERE shift_id = ? AND status = 'FINISHED'",
      )
      .get(shiftId) as { n: number; avg: number | null };
    return { completed: row.n, avg: row.avg === null ? null : Math.round(row.avg) };
  }

  countByBarber(): Map<number, number> {
    const rows = this.db
      .prepare("SELECT barber_id, COUNT(*) AS n FROM attendances WHERE status = 'FINISHED' GROUP BY barber_id")
      .all() as { barber_id: number; n: number }[];
    return new Map(rows.map((r) => [r.barber_id, r.n]));
  }

  private where(f: Pick<HistoryFilter, 'from' | 'to' | 'barberId'>): { sql: string; params: number[] } {
    const clauses = ["a.status IN ('FINISHED', 'IN_PROGRESS', 'CLOSED_BY_SHIFT')"];
    const params: number[] = [];
    if (f.from !== undefined) {
      clauses.push('a.started_at >= ?');
      params.push(f.from);
    }
    if (f.to !== undefined) {
      clauses.push('a.started_at < ?');
      params.push(f.to);
    }
    if (f.barberId !== undefined) {
      clauses.push('a.barber_id = ?');
      params.push(f.barberId);
    }
    return { sql: clauses.join(' AND '), params };
  }

  history(f: HistoryFilter): { rows: Record<string, unknown>[]; total: number } {
    const w = this.where(f);
    const rows = this.db
      .prepare(
        `SELECT a.*, b.display_name AS barber_name, s.date AS shift_date
           FROM attendances a
           JOIN barbers b ON b.id = a.barber_id
           JOIN shifts s ON s.id = a.shift_id
          WHERE ${w.sql}
          ORDER BY a.started_at DESC, a.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...w.params, f.limit, f.offset) as Record<string, unknown>[];
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM attendances a WHERE ${w.sql}`).get(...w.params) as { n: number }
    ).n;
    return { rows, total };
  }

  summary(f: Pick<HistoryFilter, 'from' | 'to' | 'barberId'>): Record<string, unknown>[] {
    const w = this.where(f);
    return this.db
      .prepare(
        `SELECT a.barber_id, b.display_name AS barber_name,
                SUM(CASE WHEN a.status = 'FINISHED' THEN 1 ELSE 0 END) AS finished,
                SUM(CASE WHEN a.status = 'FINISHED' AND a.kind = 'ROTATION' THEN 1 ELSE 0 END) AS rotation,
                SUM(CASE WHEN a.status = 'FINISHED' AND a.kind = 'SPECIFIC' THEN 1 ELSE 0 END) AS specific,
                AVG(CASE WHEN a.status = 'FINISHED' THEN a.duration_seconds END) AS avg_seconds,
                COALESCE(SUM(CASE WHEN a.status = 'FINISHED' THEN a.duration_seconds END), 0) AS total_seconds
           FROM attendances a JOIN barbers b ON b.id = a.barber_id
          WHERE ${w.sql}
          GROUP BY a.barber_id
          ORDER BY finished DESC, b.display_name COLLATE NOCASE`,
      )
      .all(...w.params) as Record<string, unknown>[];
  }
}

