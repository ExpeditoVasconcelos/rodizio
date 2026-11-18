import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type Express } from 'express';
import { AppError } from './domain/errors.js';
import { errorHandler } from './middleware/errors.js';
import { adminRouter } from './routes/admin.js';
import { operationsRouter } from './routes/operations.js';
import type { AppContext } from './services/appContext.js';
import { RealtimeHub } from './websocket/hub.js';

export interface RunningServer {
  app: Express;
  server: http.Server;
  hub: RealtimeHub;
  port: number;
  close: () => Promise<void>;
}

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '3mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: ctx.currentMode(), time: Date.now() });
  });
  app.use('/api', operationsRouter(ctx));
  app.use('/api/admin', adminRouter(ctx));
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND')));

  // Somente a pasta de imagens enviadas é pública — o arquivo SQLite nunca é exposto.
  app.use('/uploads', express.static(ctx.config.uploadsDir, { dotfiles: 'deny', index: false, maxAge: '7d' }));

  const clientDir = ctx.config.clientDir;
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(
      express.static(clientDir, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path === '/ws') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('text/plain').send(
        'Interface ainda não compilada. Execute "npm run build" (ou use "npm run dev" durante o desenvolvimento).',
      );
    });
  }

  app.use(errorHandler(ctx));
  return app;
}

export async function startServer(ctx: AppContext): Promise<RunningServer> {
  const app = createApp(ctx);
  const server = http.createServer(app);
  const hub = new RealtimeHub(ctx);
  hub.attach(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(ctx.config.port, ctx.config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : ctx.config.port;

  return {
    app,
    server,
    hub,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

