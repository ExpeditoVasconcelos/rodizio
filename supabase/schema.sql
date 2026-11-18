-- =====================================================================
-- SCHEMA OFICIAL BARBA DE URSO — SUPABASE (POSTGRESQL)
-- =====================================================================

-- 1. TABELA DE PROFISSIONAIS (BARBEIROS)
CREATE TABLE IF NOT EXISTS public.barbers (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  photo        TEXT,
  color        TEXT,
  active       SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  rest_state   TEXT NOT NULL DEFAULT 'OFF' CHECK (rest_state IN ('OFF', 'PAUSED')),
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

-- 2. TABELA DE TURNOS (EXPEDIENTE DIÁRIO)
CREATE TABLE IF NOT EXISTS public.shifts (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date         TEXT NOT NULL,
  opened_at    BIGINT NOT NULL,
  closed_at    BIGINT,
  status       TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  close_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON public.shifts (status) WHERE status = 'OPEN';

-- 3. FILA DE ESPERA (RODÍZIO)
CREATE TABLE IF NOT EXISTS public.queue_entries (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id   BIGINT NOT NULL REFERENCES public.barbers (id) ON DELETE CASCADE,
  shift_id    BIGINT NOT NULL REFERENCES public.shifts (id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  entered_at  BIGINT NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('WAITING', 'SERVED', 'REMOVED', 'VOIDED')),
  left_at     BIGINT,
  exit_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_waiting_per_barber ON public.queue_entries (barber_id) WHERE state = 'WAITING';
CREATE INDEX IF NOT EXISTS idx_queue_order ON public.queue_entries (shift_id, state, seq);

-- 4. ATENDIMENTOS (CORTE / BARBA)
CREATE TABLE IF NOT EXISTS public.attendances (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id         BIGINT NOT NULL REFERENCES public.shifts (id) ON DELETE CASCADE,
  barber_id        BIGINT NOT NULL REFERENCES public.barbers (id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('ROTATION', 'PREFERRED')),
  queue_position   INTEGER,
  started_at       BIGINT NOT NULL,
  finished_at      BIGINT,
  status           TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'FINISHED', 'CANCELLED', 'CLOSED_BY_SHIFT')),
  duration_seconds INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_attendance_per_barber ON public.attendances (barber_id) WHERE status = 'IN_PROGRESS';
CREATE INDEX IF NOT EXISTS idx_attendances_shift ON public.attendances (shift_id, started_at);

-- 5. AUDITORIA E DESFAZER SEGURO
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation  TEXT NOT NULL,
  actor      TEXT NOT NULL,
  barber_id  BIGINT REFERENCES public.barbers (id) ON DELETE SET NULL,
  shift_id   BIGINT REFERENCES public.shifts (id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL,
  undone_at  BIGINT,
  undoable   SMALLINT NOT NULL DEFAULT 0,
  info       TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON public.audit_logs (created_at DESC);

-- 6. CONFIGURAÇÕES DO SISTEMA
CREATE TABLE IF NOT EXISTS public.system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Configurações iniciais
INSERT INTO public.system_settings (key, value) VALUES
  ('shop_name', 'Barba de Urso'),
  ('undo_window_seconds', '90'),
  ('version', '1')
ON CONFLICT (key) DO NOTHING;

-- 7. CADASTRO INICIAL DOS 13 COLABORADORES OFICIAIS
DO $$
DECLARE
  now_ts BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  today_date TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  shift_record_id BIGINT;
BEGIN
  -- Insere os 13 colaboradores caso a tabela esteja vazia
  IF NOT EXISTS (SELECT 1 FROM public.barbers LIMIT 1) THEN
    INSERT INTO public.barbers (full_name, display_name, color, active, rest_state, created_at, updated_at) VALUES
      ('Severino', 'Severino', '#3b82f6', 1, 'OFF', now_ts, now_ts),
      ('Bruno',    'Bruno',    '#10b981', 1, 'OFF', now_ts, now_ts),
      ('Felipe',   'Felipe',   '#f59e0b', 1, 'OFF', now_ts, now_ts),
      ('Calvinho', 'Calvinho', '#f43f5e', 1, 'OFF', now_ts, now_ts),
      ('Israel',   'Israel',   '#8b5cf6', 1, 'OFF', now_ts, now_ts),
      ('Mateus',   'Mateus',   '#22c55e', 1, 'OFF', now_ts, now_ts),
      ('Izaiane',  'Izaiane',  '#06b6d4', 1, 'OFF', now_ts, now_ts),
      ('Daniel',   'Daniel',   '#f97316', 1, 'OFF', now_ts, now_ts),
      ('Gerson',   'Gerson',   '#6366f1', 1, 'OFF', now_ts, now_ts),
      ('Tainãn',   'Tainãn',   '#ec4899', 1, 'OFF', now_ts, now_ts),
      ('Carlos',   'Carlos',   '#3b82f6', 1, 'OFF', now_ts, now_ts),
      ('Raul',     'Raul',     '#10b981', 1, 'OFF', now_ts, now_ts),
      ('Diogo',    'Diogo',    '#f59e0b', 1, 'OFF', now_ts, now_ts);
  END IF;

  -- Abre o turno inicial de hoje se nenhum estiver aberto
  SELECT id INTO shift_record_id FROM public.shifts WHERE status = 'OPEN' LIMIT 1;
  IF shift_record_id IS NULL THEN
    INSERT INTO public.shifts (date, opened_at, status)
    VALUES (today_date, now_ts, 'OPEN')
    RETURNING id INTO shift_record_id;
  END IF;

  -- Coloca os 13 colaboradores na fila inicial de espera
  IF NOT EXISTS (SELECT 1 FROM public.queue_entries WHERE shift_id = shift_record_id AND state = 'WAITING') THEN
    INSERT INTO public.queue_entries (barber_id, shift_id, seq, entered_at, state)
    SELECT
      b.id,
      shift_record_id,
      row_number() OVER (ORDER BY b.id),
      now_ts + (row_number() OVER (ORDER BY b.id) * 100),
      'WAITING'
    FROM public.barbers b
    WHERE b.active = 1
    ORDER BY b.id;
  END IF;
END $$;

-- 8. HABILITAR SUPABASE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.barbers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
