import type { AttendanceKind, BarberState, OperationName } from '../../shared/types';

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds)) return '—';
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "42 min" / "1 h 05" — para médias e totais. */
export function formatMinutes(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function formatClock(ms: number, withSeconds = false): string {
  return new Date(ms).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
  });
}

export function formatDateLong(ms: number): string {
  const s = new Date(ms).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDateTime(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const STATE_LABEL: Record<BarberState | 'INATIVO', string> = {
  APTO: 'NA FILA',
  TRABALHANDO: 'TRABALHANDO',
  PAUSA: 'EM PAUSA',
  FORA: 'FORA DO EXPEDIENTE',
  INATIVO: 'INATIVO',
};

export const KIND_LABEL: Record<AttendanceKind, string> = {
  ROTATION: 'RODÍZIO',
  SPECIFIC: 'ESCOLHA ESPECÍFICA',
};

/** Frase curta para "Última ação". */
export function operationPhrase(op: OperationName): string {
  switch (op) {
    case 'ENTER':
      return 'entrou na fila';
    case 'RESUME':
      return 'voltou à fila';
    case 'START':
      return 'iniciou atendimento';
    case 'FINISH':
      return 'finalizou o atendimento';
    case 'PAUSE':
      return 'entrou em pausa';
    case 'CLOCK_OUT':
      return 'encerrou o expediente';
    default:
      return 'foi atualizado';
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Cores com ótimo contraste tanto no modo escuro padrão quanto no modo branco secundário. */
export const BARBER_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#8b5cf6',
  '#22c55e',
  '#06b6d4',
  '#f97316',
  '#6366f1',
  '#ec4899',
];
