import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../domain/errors.js';
import type { AppContext } from '../services/appContext.js';

/** Converte qualquer erro em resposta JSON padronizada; em conflitos, devolve o estado atual. */
export function errorHandler(ctx: AppContext) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    let appErr: AppError;
    if (err instanceof AppError) {
      appErr = err;
    } else if ((err as { type?: string })?.type === 'entity.too.large') {
      appErr = new AppError('BAD_REQUEST', 'ARQUIVO MUITO GRANDE.');
    } else if (err instanceof SyntaxError) {
      appErr = new AppError('BAD_REQUEST');
    } else {
      console.error('[api] erro inesperado:', err);
      appErr = new AppError('INTERNAL');
    }
    let snapshot;
    if (appErr.status === 409 || appErr.status === 500) {
      try {
        snapshot = ctx.current().snapshot();
      } catch {
        /* sem snapshot */
      }
    }
    res.status(appErr.status).json({ ok: false, error: { code: appErr.code, message: appErr.message }, snapshot });
  };
}

