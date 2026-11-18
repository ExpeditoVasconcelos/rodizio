import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config.js';
import { closeDatabase, openDatabase, type Db } from '../database/connection.js';
import { migrateSystem } from '../database/schema.js';
import { AppError } from '../domain/errors.js';
import { SystemRepository } from '../repositories/systemRepository.js';
import { AuthService } from './authService.js';
import { seedProductionIfEmpty } from './productionSeed.js';
import { RodizioService, type RodizioSettings } from './rodizioService.js';

export type ChangeListener = () => void;

/**
 * Contexto principal de produção: mantém o banco operacional oficial (rodizio.db)
 * e o banco de sistema (usuários e configurações).
 */
export class AppContext {
  readonly system: SystemRepository;
  readonly auth: AuthService;
  private systemDb: Db;
  private real: RodizioService;
  private listeners = new Set<ChangeListener>();
  private maintenanceTimer?: NodeJS.Timeout;
  private backupTimer?: NodeJS.Timeout;
  private closed = false;

  constructor(readonly config: AppConfig) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.mkdirSync(config.backupsDir, { recursive: true });
    this.systemDb = openDatabase(this.file('sistema.db'));
    migrateSystem(this.systemDb);
    this.system = new SystemRepository(this.systemDb);
    if (!this.system.getSetting('shop_name') || this.system.getSetting('shop_name') === 'Barbearia') {
      this.system.setSetting('shop_name', 'Barba de Urso');
    }
    this.system.setSetting('mode', 'real');
    this.auth = new AuthService(this.system, config.initialAdminPin);
    this.real = this.createService(this.file('rodizio.db'));
    seedProductionIfEmpty(this.real);
  }

  start(): { integrity: string; fixes: string[] } {
    const report = this.real.recover();
    this.maintenanceTimer = setInterval(() => {
      try {
        this.real.maintain();
      } catch (err) {
        console.error('[manutenção] falhou:', err);
      }
    }, 30_000);
    this.maintenanceTimer.unref();
    this.backupTimer = setInterval(() => this.safeBackup('auto'), this.config.backupEveryHours * 3600_000);
    this.backupTimer.unref();
    this.safeBackup('inicio');
    return report;
  }

  private file(name: string): string {
    return path.join(this.config.dataDir, name);
  }

  private createService(dbFile: string): RodizioService {
    const db = openDatabase(dbFile);
    return new RodizioService(db, {
      mode: 'real',
      settings: () => this.settings(),
      onChange: () => this.emit(),
    });
  }

  currentMode(): 'real' {
    return 'real';
  }

  current(): RodizioService {
    return this.real;
  }

  realService(): RodizioService {
    return this.real;
  }

  settings(): RodizioSettings {
    const win = Number.parseInt(this.system.getSetting('undo_window_seconds') ?? '', 10);
    return {
      shopName: this.system.getSetting('shop_name') ?? 'Barba de Urso',
      logoUrl: this.system.getSetting('logo_url') ?? null,
      undoWindowSeconds: Number.isFinite(win) && win >= 5 ? win : 90,
    };
  }

  updateSettings(patch: { shopName?: string; undoWindowSeconds?: number }, actor: string): void {
    if (patch.shopName !== undefined) {
      const name = patch.shopName.trim();
      if (!name || name.length > 60) throw new AppError('BAD_REQUEST', 'INFORME UM NOME DE ATÉ 60 CARACTERES.');
      this.system.setSetting('shop_name', name);
    }
    if (patch.undoWindowSeconds !== undefined) {
      const n = Math.round(Number(patch.undoWindowSeconds));
      if (!Number.isFinite(n) || n < 5 || n > 600) {
        throw new AppError('BAD_REQUEST', 'O TEMPO PARA DESFAZER DEVE FICAR ENTRE 5 E 600 SEGUNDOS.');
      }
      this.system.setSetting('undo_window_seconds', String(n));
    }
    this.real.touch(actor);
  }

  saveImage(dataUrl: string, prefix: string): string {
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
    if (!m) throw new AppError('BAD_REQUEST', 'IMAGEM INVÁLIDA. USE PNG, JPEG OU WEBP.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 1_500_000) throw new AppError('BAD_REQUEST', 'IMAGEM MUITO GRANDE.');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const name = `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(this.config.uploadsDir, name), buf);
    return `/uploads/${name}`;
  }

  setLogo(url: string | null, actor: string): void {
    if (url) this.system.setSetting('logo_url', url);
    else this.system.deleteSetting('logo_url');
    this.real.touch(actor);
  }

  backup(label: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const name = `rodizio-${stamp}-${label}.db`;
    this.real.backupTo(path.join(this.config.backupsDir, name));
    this.pruneBackups();
    return name;
  }

  private safeBackup(label: string): void {
    try {
      this.backup(label);
    } catch (err) {
      console.error('[backup] falhou:', err);
    }
  }

  listBackups(): { name: string; sizeBytes: number; createdAt: number }[] {
    return fs
      .readdirSync(this.config.backupsDir)
      .filter((f) => /^rodizio-[\w-]+\.db$/.test(f))
      .map((name) => {
        const st = fs.statSync(path.join(this.config.backupsDir, name));
        return { name, sizeBytes: st.size, createdAt: st.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  backupPath(name: string): string {
    if (!/^rodizio-[\w-]+\.db$/.test(name)) throw new AppError('NOT_FOUND');
    const file = path.join(this.config.backupsDir, name);
    if (!fs.existsSync(file)) throw new AppError('NOT_FOUND');
    return file;
  }

  private pruneBackups(): void {
    const all = this.listBackups();
    for (const old of all.slice(this.config.backupKeep)) {
      fs.rmSync(path.join(this.config.backupsDir, old.name), { force: true });
    }
  }

  onChange(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err) {
        console.error('[eventos] listener falhou:', err);
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    if (this.backupTimer) clearInterval(this.backupTimer);
    this.safeBackup('encerramento');
    closeDatabase(this.real.db);
    closeDatabase(this.systemDb);
  }
}
