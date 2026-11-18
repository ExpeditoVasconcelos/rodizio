import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppContext } from '../services/appContext.js';

export interface AuthedRequest extends Request {
  adminUser?: string;
}

/** Exige token válido (emitido pelo login com PIN) para endpoints administrativos. */
export function requireAdmin(ctx: AppContext): RequestHandler {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
      req.adminUser = ctx.auth.verifyToken(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}
