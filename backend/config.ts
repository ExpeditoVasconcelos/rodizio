import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ROOT = process.env.RODIZIO_ROOT ? path.resolve(process.env.RODIZIO_ROOT) : process.cwd();

function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  uploadsDir: string;
  backupsDir: string;
  clientDir: string;
  initialAdminPin: string;
  backupEveryHours: number;
  backupKeep: number;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  // Em ambiente Serverless (Vercel), o sistema de arquivos fora de /tmp é somente leitura.
  const defaultDataDir = process.env.VERCEL
    ? path.join(os.tmpdir(), 'barba-de-urso-data')
    : path.resolve(ROOT, 'data');
  const dataDir = process.env.DATA_DIR ? path.resolve(ROOT, process.env.DATA_DIR) : defaultDataDir;

  return {
    port: int('PORT', 3000),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir,
    uploadsDir: path.join(dataDir, 'uploads'),
    backupsDir: path.join(dataDir, 'backups'),
    clientDir: path.join(ROOT, 'dist', 'client'),
    initialAdminPin: process.env.ADMIN_PIN ?? '1234',
    backupEveryHours: int('BACKUP_EVERY_HOURS', 6),
    backupKeep: int('BACKUP_KEEP', 30),
    ...overrides,
  };
}
