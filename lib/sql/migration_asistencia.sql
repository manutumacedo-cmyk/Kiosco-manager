-- =========================================================================
-- Registro de asistencia (attendance): entrada/salida explícitas del local.
-- Aplicar una vez en Supabase (SQL Editor). Idempotente.
--
-- No confundir con `user_sessions` (sesión de login/JWT) ni `cash_sessions`
-- (turno de caja). Esto registra presencia física: "estoy en el local" /
-- "me fui". La salida es explícita — el logout NO cierra la asistencia,
-- porque en un POS compartido te deslogueás para que opere otro y seguís
-- trabajando en el local.
-- =========================================================================

CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  check_in   TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice único parcial: un usuario no puede tener dos entradas abiertas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_open
  ON attendance(user_id) WHERE check_out IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_checkin
  ON attendance(check_in DESC);
