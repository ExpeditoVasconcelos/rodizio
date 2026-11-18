import { useSyncExternalStore } from 'react';
import { rodizioStore } from '../services/connection/store';

/** Um único temporizador compartilhado por todos os cronômetros da tela. */
const listeners = new Set<() => void>();
let timer: number | undefined;
let tick = Math.floor(rodizioStore.serverNow() / 1000) * 1000;

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (timer === undefined) {
    timer = window.setInterval(() => {
      tick = Math.floor(rodizioStore.serverNow() / 1000) * 1000;
      listeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Hora do servidor (ms), atualizada a cada segundo. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => tick);
}

