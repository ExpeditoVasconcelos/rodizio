import { useSyncExternalStore } from 'react';

export type ToastKind = 'error' | 'info' | 'success';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushToast(kind: ToastKind, text: string, ms = kind === 'error' ? 5200 : 3200): void {
  const id = nextId++;
  // Mantém no máximo 3 avisos e evita repetir a mesma mensagem.
  toasts = [...toasts.filter((t) => t.text !== text), { id, kind, text }].slice(-3);
  emit();
  window.setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
}

