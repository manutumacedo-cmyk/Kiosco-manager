-- M11 · Centro de notificaciones del negocio (solo admin)
--
-- El kiosco es nocturno y el dueno no esta presente todas las noches. Este es el canal
-- por donde el sistema le avisa cosas que quiere ver sin tener que abrir la base: por
-- ahora, logins fuera del horario de trabajo (18:30-03:30, hora de Rivera); mas adelante,
-- lo que haga falta (descuadres grandes, anulaciones tardias, stock en cero).
--
-- La tabla nace generica a proposito: `tipo` + `metadata` jsonb, para que agregar un aviso
-- nuevo sea insertar una fila con otro `tipo`, no una migracion.
--
-- La "ultima conexion" de cada usuario NO vive aca ni en `users`: sale de
-- max(user_sessions.created_at), que ya se escribe en cada login desde
-- migration_sesiones_y_borrado_usuarios.sql. Una columna paralela seria estado duplicado.
--
-- Aplicar una vez en Supabase (SQL Editor). Idempotente.

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL,              -- 'login_fuera_horario', y lo que venga
  severidad   TEXT NOT NULL DEFAULT 'info'
              CHECK (severidad IN ('info', 'alerta', 'critico')),
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  -- A quien SE REFIERE el aviso (no a quien se le muestra: las notificaciones son del
  -- admin). ON DELETE SET NULL y no CASCADE: el borrado de usuarios es logico
  -- (users.deleted_at), pero si alguna vez se borra de verdad, el aviso tiene que
  -- sobrevivir — es justamente el rastro de auditoria.
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- hora local, ip, user_agent, etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  leida_at    TIMESTAMPTZ,
  leida_por   UUID REFERENCES users(id) ON DELETE SET NULL
);

-- La lista siempre se pide por fecha descendente.
CREATE INDEX IF NOT EXISTS idx_notifications_recientes
  ON notifications(created_at DESC);

-- El badge del nav cuenta no leidas en cada carga: indice parcial para que sea O(pocas).
CREATE INDEX IF NOT EXISTS idx_notifications_no_leidas
  ON notifications(created_at DESC) WHERE leida_at IS NULL;

COMMENT ON TABLE notifications IS
  'Avisos del negocio para el admin. Genericos por tipo; ver M11 en docs/01-AUDITORIA.md.';
COMMENT ON COLUMN notifications.user_id IS
  'Usuario al que se refiere el aviso (ej. quien se logueo fuera de horario), no el destinatario.';
COMMENT ON COLUMN notifications.metadata IS
  'Contexto del aviso. Para login_fuera_horario: hora_local, ip, user_agent.';

-- ---- Ultima conexion por usuario -------------------------------------------
-- No se agrega columna a `users`: la ultima conexion es max(created_at) de las sesiones
-- del usuario, que ya se escriben en cada login. Este indice es para que esa consulta
-- (una por usuario, ordenada desc con limit 1) no haga scan de la tabla cuando se
-- acumulen anios de logins. El indice que ya existia (idx_user_sessions_active) es
-- parcial sobre sesiones abiertas y no sirve para esta.
CREATE INDEX IF NOT EXISTS idx_user_sessions_ultimo_login
  ON user_sessions(user_id, created_at DESC);
