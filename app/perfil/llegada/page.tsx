import { headers } from "next/headers";
import LlegadaClient from "./LlegadaClient";

// Pantalla bloqueante: el middleware manda acá a todo el que inició sesión sin
// tener una entrada abierta. Una sola cosa que hacer, un solo botón.
export default async function LlegadaPage() {
  const headersList = await headers();
  const username = headersList.get("x-user-name") ?? "";
  return <LlegadaClient username={username} />;
}
