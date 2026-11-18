import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../domain/errors.js';

export type Db = DatabaseSync;

/** Abre (ou cria) um banco SQLite com as configurações de durabilidade adequadas. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  // FULL: cada transação confirmada sobrevive a queda de energia.
  db.exec('PRAGMA synchronous = FULL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/**
 * Executa `fn` dentro de uma transação imediata (escrita exclusiva).
 * Qualquer exceção desfaz toda a alteração. Falhas inesperadas do banco viram DB_FAILURE.
 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* já revertido */
    }
    if (err instanceof AppError) throw err;
    console.error('[db] falha na transação:', err);
    throw new AppError('DB_FAILURE');
  }
}

/** Cópia consistente do banco em andamento (seguro com o servidor em execução). */
export function backupTo(db: Db, destFile: string): void {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  if (fs.existsSync(destFile)) fs.rmSync(destFile);
  const escaped = destFile.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
}

export function closeDatabase(db: Db): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    /* ignore */
  }
  db.close();
}

