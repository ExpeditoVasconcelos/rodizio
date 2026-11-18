/**
 * Tipos compartilhados entre backend e frontend (somente tipos — sem código em tempo de execução).
 */

export type Mode = 'real' | 'demo';

/** Estados operacionais do profissional. */
export type BarberState = 'APTO' | 'TRABALHANDO' | 'PAUSA' | 'FORA';

export type AttendanceKind = 'ROTATION' | 'SPECIFIC';

export type AttendanceStatus = 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED' | 'CLOSED_BY_SHIFT';

export type OperationName =
  | 'ENTER'
  | 'RESUME'
  | 'START'
  | 'FINISH'
  | 'PAUSE'
  | 'CLOCK_OUT'
  | 'UNDO';

export interface ActiveAttendance {
  id: number;
  kind: AttendanceKind;
  startedAt: number;
  queuePosition: number | null;
}

export interface BarberView {
  id: number;
  fullName: string;
  displayName: string;
  photoUrl: string | null;
  color: string | null;
  state: BarberState;
  /** Posição (1..n) quando APTO. */
  position: number | null;
  /** Momento de entrada na fila (epoch ms) quando APTO. */
  queueEnteredAt: number | null;
  attendance: ActiveAttendance | null;
}

export interface ShiftView {
  id: number;
  date: string;
  openedAt: number;
  status: 'OPEN' | 'CLOSED';
}

export interface UndoInfo {
  auditId: number;
  operation: OperationName;
  barberName: string;
  expiresAt: number;
}

export interface StatsView {
  waiting: number;
  working: number;
  resting: number;
  activeBarbers: number;
  completedToday: number;
  avgDurationSeconds: number | null;
  longestRunningSeconds: number | null;
}

export interface StateSnapshot {
  /** Identifica a "linha do tempo" dos dados (modo + época do banco). */
  stream: string;
  version: number;
  serverTime: number;
  mode: Mode;
  shop: { name: string; logoUrl: string | null };
  /** `null` quando o turno de hoje foi encerrado (ou nunca aberto). */
  shift: ShiftView | null;
  shiftClosedToday: boolean;
  /** Apenas profissionais ativos. */
  barbers: BarberView[];
  stats: StatsView;
  undo: UndoInfo | null;
}

export interface OperationSummary {
  operation: OperationName;
  auditId: number;
  barberId: number | null;
  barberName: string | null;
  kind?: AttendanceKind;
  position?: number;
  durationSeconds?: number;
  duplicate?: boolean;
}

export interface ApiOk {
  ok: true;
  snapshot: StateSnapshot;
  result?: OperationSummary;
}

export interface ApiFail {
  ok: false;
  error: { code: string; message: string };
  /** Estado atual do servidor, para ressincronizar o cliente. */
  snapshot?: StateSnapshot;
}

export type ApiResponse = ApiOk | ApiFail;

/* ----------------------------- Administração ----------------------------- */

export interface AdminBarber {
  id: number;
  fullName: string;
  displayName: string;
  photoUrl: string | null;
  color: string | null;
  active: boolean;
  state: BarberState | 'INATIVO';
  totalAttendances: number;
  createdAt: number;
}

export interface AttendanceRow {
  id: number;
  barberId: number;
  barberName: string;
  shiftId: number;
  shiftDate: string;
  kind: AttendanceKind;
  queuePosition: number | null;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
  status: AttendanceStatus;
  source: string | null;
}

export interface BarberSummaryRow {
  barberId: number;
  barberName: string;
  finished: number;
  rotation: number;
  specific: number;
  avgDurationSeconds: number | null;
  totalSeconds: number;
}

export interface AuditRow {
  id: number;
  operation: string;
  actor: string;
  createdAt: number;
  barberId: number | null;
  barberName: string | null;
  info: Record<string, unknown> | null;
  undone: boolean;
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: number;
}

export interface SystemInfo {
  mode: Mode;
  port: number;
  host: string;
  addresses: { name: string; address: string; url: string }[];
  mustChangePin: boolean;
  nodeVersion: string;
  uptimeSeconds: number;
  settings: {
    shopName: string;
    logoUrl: string | null;
    undoWindowSeconds: number;
  };
}

