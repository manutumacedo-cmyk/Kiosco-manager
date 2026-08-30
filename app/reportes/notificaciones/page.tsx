import { listarNotificaciones } from "@/lib/services/notifications";
import NotificacionesClient from "./NotificacionesClient";

// Los avisos se leen en el servidor: `notifications` se consulta con la service role key
// y la ruta ya está detrás del gate de admin en middleware.ts.
export default async function NotificacionesPage() {
  const notificaciones = await listarNotificaciones();
  return <NotificacionesClient initial={notificaciones} />;
}
