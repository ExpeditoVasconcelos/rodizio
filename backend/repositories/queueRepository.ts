import type { Db } from '../database/connection.js';

export type EntryState = 'WAITING' | 'SERVED' | 'REMOVED' | 'VOIDED';

export interface QueueEntryRow {
  id: number;
  barber_id: number;
  shift_id: number;
  seq: number;
  entered_at: number;
  state: EntryState;
  left_at: number | null;
  exit_reason: string | null;
}

export class QueueRepository {
  constructor(private db: Db) {}

  get(id: number): QueueEntryRow | undefined {
    return this.db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(id) as unknown as
      | QueueEntryRow
      | undefined;
  }

  /** Fila de espera na ordem de entrada (primeiro = próximo a atender). */
  waiting(shiftId: number): QueueEntryRow[] {
    return this.db
      .prepare("SELECT * FROM queue_entries WHERE shift_id = ? AND state = 'WAITING' ORDER BY seq")
      .all(shiftId) as unknown as QueueEntryRow[];
  }

  waitingFor(barberId: number): QueueEntryRow | undefined {
    return this.db
      .prepare("SELECT * FROM queue_entries WHERE barber_id = ? AND state = 'WAITING'")
      .get(barberId) as unknown as QueueEntryRow | undefined;
  }

  /** Posição (1-based) de uma entrada dentro da fila de espera. */
  positionOf(entry: QueueEntryRow): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM queue_entries WHERE shift_id = ? AND state = 'WAITING' AND seq < ?")
      .get(entry.shift_id, entry.seq) as { n: number };
    return row.n + 1;
  }

  /** Insere SEMPRE no final da fila. */
  pushBack(barberId: number, shiftId: number, now: number): number {
    const next = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM queue_entries WHERE shift_id = ?')
      .get(shiftId) as { n: number };
    const res = this.db
      .prepare(
        "INSERT INTO queue_entries (barber_id, shift_id, seq, entered_at, state) VALUES (?, ?, ?, ?, 'WAITING')",
      )
      .run(barberId, shiftId, next.n, now);
    return Number(res.lastInsertRowid);
  }

  leave(id: number, state: 'SERVED' | 'REMOVED' | 'VOIDED', reason: string, now: number): void {
    this.db
      .prepare('UPDATE queue_entries SET state = ?, exit_reason = ?, left_at = ? WHERE id = ?')
      .run(state, reason, now, id);
  }

  /** Restaura uma entrada (desfazer), mantendo o número sequencial original. */
  restore(id: number): void {
    this.db
      .prepare("UPDATE queue_entries SET state = 'WAITING', exit_reason = NULL, left_at = NULL WHERE id = ?")
      .run(id);
  }

  removeAllWaiting(shiftId: number, reason: string, now: number): void {
    this.db
      .prepare(
        "UPDATE queue_entries SET state = 'REMOVED', exit_reason = ?, left_at = ? WHERE shift_id = ? AND state = 'WAITING'",
      )
      .run(reason, now, shiftId);
  }
}

