import type { StateSnapshot } from '../../../shared/types';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://vmsusvlwleahhcvupdtc.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_yY0AE65u7o4Niduouta8Ug_I3gk7qOE';

let supabaseChannel: RealtimeChannel | null = null;

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface RodizioState {
  snapshot: StateSnapshot | null;
  status: ConnectionStatus;
  everConnected: boolean;
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
  serverNow: (): number => Date.now() + state.offsetMs,

  applySnapshot(next: StateSnapshot): void {
    const cur = state.snapshot;
    if (cur && cur.stream === next.stream && next.version < cur.version) return;
    set({
      snapshot: next,
      offsetMs: next.serverTime - Date.now(),
      status: 'online',
      everConnected: true,
    });
  },

  setStatus(status: ConnectionStatus): void {
    if (state.status === status) return;
    set({ status, everConnected: state.everConnected || status === 'online' });
  },
};

/* ---------------- Conexão híbrida: WebSocket + HTTP Polling (Vercel) ---------------- */

const WATCHDOG_MS = 13_000;
let ws: WebSocket | null = null;
let retry = 0;
let reconnectTimer: number | undefined;
let lastMessageAt = 0;
let started = false;
let wsSupported = true;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

function scheduleReconnect(): void {
  if (!wsSupported) return;
  window.clearTimeout(reconnectTimer);
  const delay = Math.min(8000, 500 * Math.pow(1.6, retry++));
  reconnectTimer = window.setTimeout(connect, delay);
}

function connect(): void {
  if (!wsSupported) return;
  window.clearTimeout(reconnectTimer);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  let socket: WebSocket;
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }
  ws = socket;
  socket.onopen = () => {
    retry = 0;
    lastMessageAt = Date.now();
    rodizioStore.setStatus('online');
  };
  socket.onmessage = (ev) => {
    lastMessageAt = Date.now();
    try {
      const msg = JSON.parse(String(ev.data)) as { type: string; snapshot?: StateSnapshot; serverTime?: number };
      if (msg.type === 'snapshot' && msg.snapshot) rodizioStore.applySnapshot(msg.snapshot);
      else if (msg.type === 'tick' && msg.serverTime) {
        const cur = rodizioStore.get();
        const offset = msg.serverTime - Date.now();
        if (Math.abs(offset - cur.offsetMs) > 400) state = { ...state, offsetMs: offset };
      }
    } catch {
      /* ignora */
    }
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    if (retry >= 4 && rodizioStore.get().status === 'online') {
      // Ambiente Serverless (ex.: Vercel) sem WebSocket persistente: opera via HTTP Polling.
      wsSupported = false;
      return;
    }
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

/** Busca o estado via HTTP (carga inicial e sincronização contínua em ambientes Serverless). */
export async function refreshState(): Promise<boolean> {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad_status');
    const json = (await res.json()) as { ok: boolean; snapshot?: StateSnapshot };
    if (json.ok && json.snapshot) {
      rodizioStore.applySnapshot(json.snapshot);
      return true;
    }
    return false;
  } catch {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      rodizioStore.setStatus('offline');
    }
    return false;
  }
}

function initSupabaseRealtime(): void {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || supabaseChannel) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseChannel = client
      .channel('barba-de-urso-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        void refreshState();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          rodizioStore.setStatus('online');
        }
      });
  } catch {
    /* fallback para http polling */
  }
}

export function startConnection(): void {
  if (started) return;
  started = true;
  initSupabaseRealtime();
  void refreshState();
  connect();

  // Polling leve automático quando o WebSocket não estiver aberto (ex.: Vercel Serverless).
  window.setInterval(() => {
    const wsOpen = ws && ws.readyState === WebSocket.OPEN;
    if (wsOpen && Date.now() - lastMessageAt > WATCHDOG_MS) {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    }
    if (!wsOpen) {
      void refreshState();
    }
  }, 2500);

  window.addEventListener('offline', () => rodizioStore.setStatus('offline'));
  window.addEventListener('online', () => {
    retry = 0;
    void refreshState();
    connect();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refreshState();
      connect();
    }
  });
}
