import { useEffect, useSyncExternalStore } from 'react';
import { rodizioStore, startConnection, type RodizioState } from '../services/connection/store';

/** Estado em tempo real (snapshot oficial do servidor + status da conexão). */
export function useRodizio(): RodizioState {
  useEffect(() => startConnection(), []);
  return useSyncExternalStore(rodizioStore.subscribe, rodizioStore.get);
}

