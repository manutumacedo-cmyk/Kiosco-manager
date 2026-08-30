import { headers } from "next/headers";
import { getOpenAttendance, listAttendanceByUser } from "@/lib/services/attendance";
import PerfilClient from "./PerfilClient";

// El perfil es de todos: cajero y admin. Cada uno ve lo suyo — el user_id sale
// del token vía middleware, nunca de la URL, así nadie puede mirar la
// asistencia de otro cambiando un parámetro.
export default async function PerfilPage() {
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? "";
  const username = headersList.get("x-user-name") ?? "";
  const role = (headersList.get("x-user-role") ?? "cajero") as "admin" | "cajero";

  const [abierta, registros] = await Promise.all([
    getOpenAttendance(userId),
    listAttendanceByUser(userId),
  ]);

  return (
    <PerfilClient
      username={username}
      role={role}
      initialAbierta={abierta}
      initialRegistros={registros}
    />
  );
}
