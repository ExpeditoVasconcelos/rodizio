import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { AppContext } from '../services/appContext.js';

/**
 * Sincronização em tempo real: envia o estado completo a cada alteração confirmada
 * e um "tick" periódico para que os clientes detectem conexões silenciosamente perdidas.
 */
export class RealtimeHub {
  private wss = new WebSocketServer({ noServer: true });
  private alive = new WeakMap<WebSocket, boolean>();
  private timer?: NodeJS.Timeout;
  private unsubscribe?: () => void;

  constructor(private ctx: AppContext) {}

  attach(server: HttpServer): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    });

    this.wss.on('connection', (ws) => {
      this.alive.set(ws, true);
      ws.on('pong', () => this.alive.set(ws, true));
      ws.on('message', (raw) => {
        this.alive.set(ws, true);
        try {
          const msg = JSON.parse(String(raw)) as { type?: string };
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
        } catch {
          /* ignora mensagens inválidas */
        }
      });
      ws.on('error', () => ws.terminate());
      this.send(ws, { type: 'snapshot', snapshot: this.ctx.current().snapshot() });
    });

    this.unsubscribe = this.ctx.onChange(() => this.broadcastState());

    this.timer = setInterval(() => {
      const tick = JSON.stringify({ type: 'tick', serverTime: Date.now() });
      for (const ws of this.wss.clients) {
        if (this.alive.get(ws) === false) {
          ws.terminate();
          continue;
        }
        this.alive.set(ws, false);
        try {
          ws.ping();
          ws.send(tick);
        } catch {
          ws.terminate();
        }
      }
    }, 5_000);
    this.timer.unref();
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  broadcastState(): void {
    const payload = JSON.stringify({ type: 'snapshot', snapshot: this.ctx.current().snapshot() });
    for (const ws of this.wss.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
    for (const ws of this.wss.clients) ws.close(1001, 'servidor encerrando');
    this.wss.close();
  }
}

