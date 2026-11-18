import type { ApiFail, ApiOk, ApiResponse } from '../../shared/types';
import { rodizioStore } from './connection/store';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export const NETWORK_ERROR_MESSAGE = 'NÃO FOI POSSÍVEL CONFIRMAR A MOVIMENTAÇÃO.';

/** Identificador único da operação (idempotência). `crypto.randomUUID` não existe em HTTP sem TLS. */
export function makeOpId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + Date.now().toString(36);
}

export function currentSource(): 'tablet' | 'recepcao' {
  const p = location.pathname;
  return p.startsWith('/admin') || p.startsWith('/demo') ? 'recepcao' : 'tablet';
}

interface RequestOptions {
  token?: string | null;
  timeoutMs?: number;
}

export async function request<T extends object = ApiOk>(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', NETWORK_ERROR_MESSAGE);
  } finally {
    window.clearTimeout(timer);
  }
  let json: (T & Partial<ApiResponse>) | null = null;
  try {
    json = (await res.json()) as T & Partial<ApiResponse>;
  } catch {
    throw new ApiError('BAD_RESPONSE', NETWORK_ERROR_MESSAGE, res.status);
  }
  if (!res.ok || json.ok === false) {
    const fail = json as unknown as ApiFail;
    if (fail.snapshot) rodizioStore.applySnapshot(fail.snapshot);
    throw new ApiError(fail.error?.code ?? 'ERROR', fail.error?.message ?? NETWORK_ERROR_MESSAGE, res.status);
  }
  return json;
}

/** Operação do rodízio: só é considerada concluída quando o servidor confirma (e o estado oficial é aplicado). */
export async function operation(path: string, body: Record<string, unknown>): Promise<ApiOk> {
  const res = await request<ApiOk>('POST', `/api/ops/${path}`, {
    ...body,
    opId: makeOpId(),
    source: currentSource(),
  });
  rodizioStore.applySnapshot(res.snapshot);
  return res;
}

