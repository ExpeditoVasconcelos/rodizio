import fs from 'node:fs';
import { Router } from 'express';
import type { SystemInfo } from '../../shared/types.js';
import { AppError } from '../domain/errors.js';
import { requireAdmin, type AuthedRequest } from '../middleware/auth.js';
import type { AppContext } from '../services/appContext.js';
import { listLanAddresses } from './operations.js';

const startedAt = Date.now();

function str(value: unknown, field: string, max = 80): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s || s.length > max) throw new AppError('BAD_REQUEST', `CAMPO INVÁLIDO: ${field}.`);
  return s;
}

function color(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new AppError('BAD_REQUEST', 'COR INVÁLIDA.');
  }
  return value.toLowerCase();
}

function id(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError('BAD_REQUEST');
  return n;
}

function dayStart(value: unknown, plusDays = 0): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).getTime();
}


/** Endpoints administrativos — todos exigem o PIN da recepção (exceto o login). */
export function adminRouter(ctx: AppContext): Router {
  const r = Router();

  r.post('/login', async (req, res) => {
    const ip = req.ip ?? 'desconhecido';
    res.json({ ok: true, ...(await ctx.auth.login(String(req.body?.pin ?? ''), ip)) });
  });

  r.use(requireAdmin(ctx));

  r.get('/session', async (_req, res) => {
    res.json({ ok: true, mustChangePin: await ctx.auth.isMustChangePin() });
  });

  r.post('/pin', async (req, res) => {
    await ctx.auth.changePin(String(req.body?.currentPin ?? ''), String(req.body?.newPin ?? ''));
    res.json({ ok: true });
  });

  /* ------------------------------ sistema ------------------------------ */

  r.get('/system', (_req, res) => {
    const s = ctx.settings();
    const info: SystemInfo = {
      mode: ctx.currentMode(),
      port: ctx.config.port,
      host: ctx.config.host,
      addresses: listLanAddresses(ctx.config.port),
      mustChangePin: ctx.auth.mustChangePin,
      nodeVersion: process.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      settings: s,
    };
    res.json({ ok: true, info });
  });

  r.put('/settings', (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    ctx.updateSettings({ shopName: b.shopName, undoWindowSeconds: b.undoWindowSeconds }, 'recepcao');
    res.json({ ok: true, settings: ctx.settings() });
  });

  r.post('/logo', (req, res) => {
    const url = req.body?.dataUrl ? ctx.saveImage(String(req.body.dataUrl), 'logo') : null;
    ctx.setLogo(url, 'recepcao');
    res.json({ ok: true, logoUrl: url });
  });

  /* ------------------------------ barbeiros ------------------------------ */

  r.get('/barbers', async (_req, res) => {
    res.json({ ok: true, barbers: await ctx.current().adminBarbers() });
  });

  r.post('/barbers', async (req, res) => {
    const b = req.body ?? {};
    const fullName = str(b.fullName, 'nome completo', 120);
    const displayName = str(b.displayName ?? fullName.split(' ')[0], 'nome de exibição', 30);
    const created = await ctx.current().createBarber({ fullName, displayName, color: color(b.color) }, 'recepcao');
    if (b.photoDataUrl) {
      await ctx.current().setBarberPhoto(created.id, ctx.saveImage(String(b.photoDataUrl), `barber-${created.id}`), 'recepcao');
    }
    res.json({ ok: true, id: created.id });
  });

  r.put('/barbers/:id', async (req, res) => {
    const b = req.body ?? {};
    const barberId = id(req.params.id);
    const svc = ctx.current();
    await svc.updateBarber(
      barberId,
      {
        fullName: str(b.fullName, 'nome completo', 120),
        displayName: str(b.displayName, 'nome de exibição', 30),
        color: color(b.color),
      },
      'recepcao',
    );
    if (b.removePhoto) await svc.setBarberPhoto(barberId, null, 'recepcao');
    else if (b.photoDataUrl) {
      await svc.setBarberPhoto(barberId, ctx.saveImage(String(b.photoDataUrl), `barber-${barberId}`), 'recepcao');
    }
    if (typeof b.active === 'boolean') {
      await svc.setBarberActive(barberId, b.active, 'recepcao');
    }
    res.json({ ok: true });
  });

  /* ------------------------------ histórico ------------------------------ */

  r.get('/history', async (req, res) => {
    const q = req.query;
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const offset = Math.max(0, Number(q.offset) || 0);
    const filter = {
      from: dayStart(q.from),
      to: dayStart(q.to, 1),
      barberId: q.barberId ? id(q.barberId) : undefined,
    };
    const svc = ctx.current();
    const historyRes = await svc.history({ ...filter, limit, offset });
    const summaryRes = await svc.summary(filter);
    res.json({
      ok: true,
      ...historyRes,
      summary: summaryRes,
    });
  });

  r.get('/audit', async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ ok: true, ...(await ctx.current().auditLog(limit, offset)) });
  });

  /* ------------------------------- turno ------------------------------- */

  r.post('/shift/open', async (_req, res) => {
    res.json(await ctx.current().openShift('recepcao'));
  });

  r.post('/shift/close', async (_req, res) => {
    const svc = ctx.current();
    const result = await svc.closeShift('recepcao');
    if (svc.mode === 'real') ctx.backup('turno-encerrado');
    res.json(result);
  });

  /* ------------------------------- backup ------------------------------- */

  r.get('/backups', (_req, res) => {
    res.json({ ok: true, backups: ctx.listBackups() });
  });

  r.post('/backups', (_req, res) => {
    const name = ctx.backup('manual');
    res.json({ ok: true, name, backups: ctx.listBackups() });
  });

  r.get('/backups/:name', (req, res, next) => {
    try {
      const file = ctx.backupPath(String(req.params.name));
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  return r;
}

