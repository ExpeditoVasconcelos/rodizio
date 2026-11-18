import type { Db } from '../database/connection.js';

export interface AuditDbRow {
  id: number;
  operation: string;
  actor: string;
  created_at: number;
  shift_id: number | null;
  barber_id: number | null;
  info: string | null;
  undoable: number;
  undone_at: number | null;
}

export class AuditRepository {
  constructor(private db: Db) {}

  add(entry: {
    operation: string;
    actor: string;
    now: number;
    shiftId: number | null;
    barberId: number | null;
    info?: Record<string, unknown>;
    undoable?: boolean;
  }): number {
    const res = this.db
      .prepare(
        `INSERT INTO audit_logs (operation, actor, created_at, shift_id, barber_id, info, undoable)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.operation,
        entry.actor,
        entry.now,
        entry.shiftId,
        entry.barberId,
        entry.info ? JSON.stringify(entry.info) : null,
        entry.undoable ? 1 : 0,
      );
    return Number(res.lastInsertRowid);
  }

  get(id: number): AuditDbRow | undefined {
    return this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as unknown as AuditDbRow | undefined;
  }

  /** Última operação desfazível que ainda não foi desfeita. */
  latestUndoable(): AuditDbRow | undefined {
    return this.db
      .prepare('SELECT * FROM audit_logs WHERE undoable = 1 AND undone_at IS NULL ORDER BY id DESC LIMIT 1')
      .get() as unknown as AuditDbRow | undefined;
  }

  /** Existe alguma alteração válida (não desfeita, exceto marcadores de desfazer) posterior a `id`? */
  hasLaterChanges(id: number): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id > ? AND operation <> 'UNDO' AND undone_at IS NULL")
      .get(id) as { n: number };
    return row.n > 0;
  }

  markUndone(id: number, now: number): void {
    this.db.prepare('UPDATE audit_logs SET undone_at = ? WHERE id = ?').run(now, id);
  }

  list(limit: number, offset: number): { rows: Record<string, unknown>[]; total: number } {
    const rows = this.db
      .prepare(
        `SELECT l.*, b.display_name AS barber_name
           FROM audit_logs l LEFT JOIN barbers b ON b.id = l.barber_id
          ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Record<string, unknown>[];
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get() as { n: number }).n;
    return { rows, total };
  }

  /* ----------------------- idempotência de operações ----------------------- */

  findProcessed(opId: string): string | undefined {
    const row = this.db.prepare('SELECT result FROM processed_ops WHERE op_id = ?').get(opId) as
      | { result: string }
      | undefined;
    return row?.result;
  }

  saveProcessed(opId: string, result: unknown, now: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO processed_ops (op_id, result, created_at) VALUES (?, ?, ?)')
      .run(opId, JSON.stringify(result), now);
    this.db.prepare('DELETE FROM processed_ops WHERE created_at < ?').run(now - 6 * 3600_000);
  }

  /* ----------------------------- meta / versão ----------------------------- */

  getMeta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  bumpVersion(): number {
    const next = Number(this.getMeta('version') ?? '0') + 1;
    this.setMeta('version', String(next));
    return next;
  }
}

