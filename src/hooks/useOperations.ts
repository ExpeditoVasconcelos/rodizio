import { useCallback, useRef, useState } from 'react';
import type { ApiOk } from '../../shared/types';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../services/http';
import { refreshState } from '../services/connection/store';
import { pushToast } from './toasts';

/**
 * Executa operações do rodízio com bloqueio de duplicidade por profissional,
 * estado de "processando" e mensagens de erro padronizadas.
 */
export function useOperations() {
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [shaking, setShaking] = useState<number | null>(null);
  const inFlight = useRef(new Set<number>());

  const run = useCallback(async (barberId: number, fn: () => Promise<ApiOk>): Promise<boolean> => {
    if (inFlight.current.has(barberId)) return false;
    inFlight.current.add(barberId);
    setPending(new Set(inFlight.current));
    try {
      await fn();
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : NETWORK_ERROR_MESSAGE;
      pushToast('error', message);
      setShaking(barberId);
      window.setTimeout(() => setShaking((s) => (s === barberId ? null : s)), 600);
      // Se a confirmação se perdeu na rede, descobre o estado real no servidor.
      if (!(err instanceof ApiError) || err.code === 'NETWORK' || err.code === 'BAD_RESPONSE') void refreshState();
      return false;
    } finally {
      inFlight.current.delete(barberId);
      setPending(new Set(inFlight.current));
    }
  }, []);

  return { pending, shaking, run };
}

