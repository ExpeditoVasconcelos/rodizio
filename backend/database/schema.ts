import type { Db } from './connection.js';

/**
 * Esquema do banco OPERACIONAL (um arquivo para dados reais e outro para a demonstração).
 * Versionado por PRAGMA user_version.
 */
const OPERATIONAL_V1 = `
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE barbers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  photo        TEXT,
  color        TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  -- Estado de repouso quando NÃO está na fila nem trabalhando.
  rest_state   TEXT NOT NULL DEFAULT 'OFF' CHECK (rest_state IN ('OFF', 'PAUSED')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE shifts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  opened_at    INTEGER NOT NULL,
  closed_at    INTEGER,
  status       TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  close_reason TEXT
);
CREATE UNIQUE INDEX one_open_shift ON shifts (status) WHERE status = 'OPEN';

CREATE TABLE queue_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  barber_id   INTEGER NOT NULL REFERENCES barbers (id),
  shift_id    INTEGER NOT NULL REFERENCES shifts (id),
  seq         INTEGER NOT NULL,
  entered_at  INTEGER NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('WAITING', 'SERVED', 'REMOVED', 'VOIDED')),
  left_at     INTEGER,
  exit_reason TEXT
);
-- Garante, no próprio banco, que um profissional nunca fica duplicado na fila.
CREATE UNIQUE INDEX one_waiting_per_barber ON queue_entries (barber_id) WHERE state = 'WAITING';
CREATE INDEX idx_queue_order ON queue_entries (shift_id, state, seq);

CREATE TABLE attendances (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  barber_id        INTEGER NOT NULL REFERENCES barbers (id),
  shift_id         INTEGER NOT NULL REFERENCES shifts (id),
  kind             TEXT NOT NULL CHECK (kind IN ('ROTATION', 'SPECIFIC')),
  queue_position   INTEGER,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  duration_seconds INTEGER,
  status           TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'FINISHED', 'CANCELLED', 'CLOSED_BY_SHIFT')),
  source           TEXT
);
-- Garante, no próprio banco, que um profissional nunca tem dois atendimentos simultâneos.
CREATE UNIQUE INDEX one_active_attendance_per_barber ON attendances (barber_id) WHERE status = 'IN_PROGRESS';
CREATE INDEX idx_att_started ON attendances (started_at);
CREATE INDEX idx_att_barber ON attendances (barber_id, started_at);

CREATE TABLE audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  operation  TEXT NOT NULL,
  actor      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  shift_id   INTEGER,
  barber_id  INTEGER,
  info       TEXT,
  undoable   INTEGER NOT NULL DEFAULT 0,
  undone_at  INTEGER
);

-- Idempotência: operações reenviadas (ex.: após queda de rede) não são executadas duas vezes.
CREATE TABLE processed_ops (
  op_id      TEXT PRIMARY KEY,
  result     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const SYSTEM_V1 = `
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  pin_hash   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function migrate(db: Db, steps: string[]): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = row.user_version;
  while (version < steps.length) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(steps[version]);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function migrateOperational(db: Db): void {
  migrate(db, [OPERATIONAL_V1]);
}

export function migrateSystem(db: Db): void {
  migrate(db, [SYSTEM_V1]);
}

