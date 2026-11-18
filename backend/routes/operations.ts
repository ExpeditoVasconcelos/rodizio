import os from 'node:os';
import { Router } from 'express';
import { AppError } from '../domain/errors.js';
import type { AppContext } from '../services/appContext.js';

export function listLanAddresses(port: number): { name: string; address: string; url: string }[] {
  const out: { name: string; address: string; url: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        out.push({ name, address: ni.address, url: `http://${ni.address}:${port}` });
      }
    }
  }
  return out.sort((a, b) => Number(b.address.startsWith('192.168.')) - Number(a.address.startsWith('192.168.')));
}

function toId(value: unknown, field = 'barberId'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError('BAD_REQUEST', `CAMPO INVÁLIDO: ${field}.`);
  return n;
}

function source(body: Record<string, unknown>): string {
  return body.source === 'recepcao' ? 'recepcao' : 'tablet';
}

function opId(body: Record<string, unknown>): string | undefined {
  return typeof body.opId === 'string' && body.opId.length >= 8 && body.opId.length <= 80 ? body.opId : undefined;
}

/**
 * Operações do rodízio — usadas pelo tablet (e pela recepção). Cada chamada só é confirmada
 * depois de validada e gravada no banco; a resposta já traz o estado atualizado.
 */
export function operationsRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/state', async (_req, res) => {
    const svc = ctx.current();
    await svc.maintain();
    res.json({ ok: true, snapshot: await svc.snapshot() });
  });

  r.get('/network', (_req, res) => {
    res.json({
      ok: true,
      port: ctx.config.port,
      addresses: listLanAddresses(ctx.config.port),
    });
  });

  r.post('/ops/enter', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().enter(toId(b.barberId), { actor: source(b), opId: opId(b) }));
  });

  r.post('/ops/resume', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().resume(toId(b.barberId), { actor: source(b), opId: opId(b) }));
  });

  r.post('/ops/start', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().start(toId(b.barberId), { actor: source(b), opId: opId(b) }));
  });

  r.post('/ops/start-next', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().startNext({ actor: source(b), opId: opId(b) }));
  });

  r.post('/ops/finish', async (req, res) => {
    const b = req.body ?? {};
    const attendanceId = b.attendanceId === undefined || b.attendanceId === null ? undefined : toId(b.attendanceId, 'attendanceId');
    res.json(await ctx.current().finish(toId(b.barberId), { actor: source(b), opId: opId(b), attendanceId }));
  });

  r.post('/ops/pause', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().pause(toId(b.barberId), { actor: source(b), opId: opId(b) }));
  });

  r.post('/ops/clock-out', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().clockOut(toId(b.barberId), { actor: source(b), opId: opId(b) }));
  });

  r.post('/ops/undo', async (req, res) => {
    const b = req.body ?? {};
    res.json(await ctx.current().undo(toId(b.auditId, 'auditId'), { actor: source(b), opId: opId(b) }));
  });

  return r;
}
