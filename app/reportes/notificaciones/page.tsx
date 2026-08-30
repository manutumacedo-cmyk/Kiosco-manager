import { listarNotificaciones, notificarEntradasSinCerrar } from "@/lib/services/notifications";
import NotificacionesClient from "./NotificacionesClient";

// Los avisos se leen en el servidor: `notifications` se consulta con la service role key
// y la ruta ya está detrás del gate de admin en middleware.ts.
export default async function NotificacionesPage() {
  // Las entradas que quedaron sin cerrar se detectan al abrir esta pantalla, no
  // por un cron: el proyecto no tiene uno, y este es justo el momento en que el
  // aviso le sirve al dueño. Es idempotente, no duplica avisos.
  try {
    await notificarEntradasSinCerrar();
  } catch (error) {
    // Un fallo acá no puede dejar al dueño sin ver sus notificaciones.
    console.error("No se pudieron revisar las entradas sin cerrar:", error);
  }

  const notificaciones = await listarNotificaciones();
  return <NotificacionesClient initial={notificaciones} />;
}
