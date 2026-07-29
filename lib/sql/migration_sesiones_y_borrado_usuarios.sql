-- =========================================================================
-- Sesiones de login (user_sessions) + borrado lógico de usuarios (deleted_at)
-- Aplicar una vez en Supabase (SQL Editor). Idempotente.
-- =========================================================================

-- 1) Tabla de sesiones de login. No confundir con `cash_sessions` (turno de
--    caja, global, no por usuario) — esto es una sesión por login/JWT.
CREATE TABLE IF NOT EXISTS user_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,              -- se completa en logout o al eliminar la cuenta
  ip_address  TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions(user_id) WHERE ended_at IS NULL;

-- 2) Borrado lógico de usuarios. `cash_sessions.user_id` /
--    `cerrado_por_user_id` tienen FK a `users.id` — un DELETE real rompería
--    el historial de caja. Nunca hacer DELETE de la fila, solo setear esto.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
