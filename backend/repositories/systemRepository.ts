import type { Db } from '../database/connection.js';

export interface UserRow {
  id: number;
  name: string;
  role: string;
  identifier: string;
  pin_hash: string;
  created_at: number;
}

/** Configurações globais e usuários (compartilhados entre modo real e demonstração). */
export class SystemRepository {
  constructor(private db: Db) {}

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }

  findUser(identifier: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE identifier = ?').get(identifier) as unknown as
      | UserRow
      | undefined;
  }

  insertUser(name: string, role: string, identifier: string, pinHash: string, now: number): void {
    this.db
      .prepare('INSERT INTO users (name, role, identifier, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, role, identifier, pinHash, now);
  }

  updatePin(identifier: string, pinHash: string): void {
    this.db.prepare('UPDATE users SET pin_hash = ? WHERE identifier = ?').run(pinHash, identifier);
  }
}

