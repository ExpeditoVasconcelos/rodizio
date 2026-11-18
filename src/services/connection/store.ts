import type { StateSnapshot } from '../../../shared/types';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface RodizioState {
  snapshot: StateSnapshot | null;
  status: ConnectionStatus;
  /** Já houve alguma conexão bem-sucedida? (diferencia "conectando" de "conexão perdida") */
  everConnected: boolean;
  /** Diferença (servidor − relógio local) em ms, para cronômetros corretos mesmo com relógios diferentes. */
  offsetMs: number;
}

type Listener = () => void;

let state: RodizioState = { snapshot: null, status: 'connecting', everConnected: false, offsetMs: 0 };
const listeners = new Set<Listener>();

function set(patch: Partial<RodizioState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const rodizioStore = {
  get: (): RodizioState => state,
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Hora do servidor (aproximada) agora. */
  serverNow: (): number => Date.now() + state.offsetMs,

  /**
   * Aplica um estado recebido do servidor, ignorando estados mais antigos que o atual.
   * (Comparação só vale dentro da mesma "linha do tempo" — modo/época do banco.)
   */
  applySnapshot(next: StateSnapshot): void {
    const cur = state.snapshot;
    if (cur && cur.stream === next.stream && next.version < cur.version) return;
    set({ snapshot: next, offsetMs: next.serverTime - Date.now() });
  },

  setStatus(status: ConnectionStatus): void {
    if (state.status === status) return;
    set({ status, everConnected: state.everConnected || status === 'online' });
  },
};

/* --------------------------- conexão em tempo real --------------------------- */

const WATCHDOG_MS = 13_000;
let ws: WebSocket | null = null;
let retry = 0;
let reconnectTimer: number | undefined;
let lastMessageAt = 0;
let started = false;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function scheduleReconnect(): void {
  window.clearTimeout(reconnectTimer);
  const delay = Math.min(5000, 400 * Math.pow(1.6, retry++));
  reconnectTimer = window.setTimeout(connect, delay);
}

function connect(): void {
  window.clearTimeout(reconnectTimer);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (!rodizioStore.get().everConnected) rodizioStore.setStatus('connecting');
  let socket: WebSocket;
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    rodizioStore.setStatus('offline');
    scheduleReconnect();
    return;
  }
  ws = socket;
  socket.onopen = () => {
    retry = 0;
    lastMessageAt = Date.now();
    rodizioStore.setStatus('online');
    // O servidor envia o estado completo ao conectar => sincronização após reconexão.
  };
  socket.onmessage = (ev) => {
    lastMessageAt = Date.now();
    try {
      const msg = JSON.parse(String(ev.data)) as { type: string; snapshot?: StateSnapshot; serverTime?: number };
      if (msg.type === 'snapshot' && msg.snapshot) rodizioStore.applySnapshot(msg.snapshot);
      else if (msg.type === 'tick' && msg.serverTime) {
        // Mantém o relógio alinhado ao do servidor.
        const cur = rodizioStore.get();
        const offset = msg.serverTime - Date.now();
        // Atualização silenciosa (sem re-render): os cronômetros leem o deslocamento a cada segundo.
        if (Math.abs(offset - cur.offsetMs) > 400) state = { ...state, offsetMs: offset };
      }
    } catch {
      /* ignora */
    }
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    rodizioStore.setStatus('offline');
    scheduleReconnect();
  };
  socket.onerror = () => {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  };
}

/** Busca o estado por HTTP (carga inicial / ressincronização manual). */
export async function refreshState(): Promise<void> {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    const json = (await res.json()) as { ok: boolean; snapshot?: StateSnapshot };
    if (json.ok && json.snapshot) rodizioStore.applySnapshot(json.snapshot);
  } catch {
    /* a conexão em tempo real cuidará do status */
  }
}

/** Inicia (uma única vez) a conexão em tempo real, reconexão automática e vigilância. */
export function startConnection(): void {
  if (started) return;
  started = true;
  void refreshState();
  connect();

  window.setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastMessageAt > WATCHDOG_MS) {
      // Silêncio prolongado: provavelmente a rede caiu sem avisar.
      rodizioStore.setStatus('offline');
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }, 3000);

  window.addEventListener('offline', () => rodizioStore.setStatus('offline'));
  window.addEventListener('online', () => {
    retry = 0;
    connect();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      connect();
      void refreshState();
    }
  });
}
