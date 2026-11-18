import { useSyncExternalStore } from 'react';
import type {
  AdminBarber,
  ApiOk,
  AttendanceRow,
  AuditRow,
  BackupInfo,
  BarberSummaryRow,
  SystemInfo,
} from '../../../shared/types';
import { ApiError, request } from '../http';

/* ------------------------------- sessão ------------------------------- */

const KEY = 'rodizio.admin.token';
let token: string | null = sessionStorage.getItem(KEY);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const adminSession = {
  get: () => token,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(t: string) {
    token = t;
    sessionStorage.setItem(KEY, t);
    emit();
  },
  clear() {
    token = null;
    sessionStorage.removeItem(KEY);
    emit();
  },
};

export function useAdminToken(): string | null {
  return useSyncExternalStore(adminSession.subscribe, adminSession.get);
}

async function call<T extends object>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<T> {
  try {
    return await request<T>(method, url, body, { token, timeoutMs: 15000 });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && url !== '/api/admin/login') adminSession.clear();
    throw err;
  }
}

/* -------------------------------- API -------------------------------- */

export interface HistoryResult {
  rows: AttendanceRow[];
  total: number;
  summary: BarberSummaryRow[];
}

export interface BarberForm {
  fullName: string;
  displayName: string;
  color: string | null;
  active?: boolean;
  photoDataUrl?: string | null;
  removePhoto?: boolean;
}

export const adminApi = {
  async login(pin: string): Promise<{ mustChangePin: boolean }> {
    const res = await call<{ token: string; mustChangePin: boolean }>('POST', '/api/admin/login', { pin });
    adminSession.set(res.token);
    return { mustChangePin: res.mustChangePin };
  },
  changePin: (currentPin: string, newPin: string) =>
    call<object>('POST', '/api/admin/pin', { currentPin, newPin }),
  system: async () => (await call<{ info: SystemInfo }>('GET', '/api/admin/system')).info,
  saveSettings: (s: { shopName?: string; undoWindowSeconds?: number }) =>
    call<object>('PUT', '/api/admin/settings', s),
  setLogo: (dataUrl: string | null) => call<object>('POST', '/api/admin/logo', { dataUrl }),

  barbers: async () => (await call<{ barbers: AdminBarber[] }>('GET', '/api/admin/barbers')).barbers,
  createBarber: (form: BarberForm) => call<{ id: number }>('POST', '/api/admin/barbers', form),
  updateBarber: (id: number, form: BarberForm) => call<object>('PUT', `/api/admin/barbers/${id}`, form),

  history: (params: { from?: string; to?: string; barberId?: number; limit: number; offset: number }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)));
    return call<HistoryResult>('GET', `/api/admin/history?${q}`);
  },
  audit: (limit: number, offset: number) =>
    call<{ rows: AuditRow[]; total: number }>('GET', `/api/admin/audit?limit=${limit}&offset=${offset}`),

  openShift: () => call<ApiOk>('POST', '/api/admin/shift/open', {}),
  closeShift: () => call<ApiOk>('POST', '/api/admin/shift/close', {}),

  backups: async () => (await call<{ backups: BackupInfo[] }>('GET', '/api/admin/backups')).backups,
  createBackup: async () => (await call<{ backups: BackupInfo[] }>('POST', '/api/admin/backups', {})).backups,
  async downloadBackup(name: string): Promise<void> {
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError('DOWNLOAD', 'NÃO FOI POSSÍVEL BAIXAR O BACKUP.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

/** Reduz a imagem escolhida (recorte quadrado) antes de enviá-la — fotos de celular são grandes. */
export function imageToDataUrl(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem.'));
    };
    img.src = url;
  });
}

