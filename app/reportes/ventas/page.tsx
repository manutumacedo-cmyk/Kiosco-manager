import { headers } from "next/headers";
import HistorialVentasClient from "./HistorialVentasClient";

export default async function HistorialVentasPage() {
  const headersList = await headers();
  const username = headersList.get("x-user-name") ?? "admin";
  return <HistorialVentasClient username={username} />;
}
