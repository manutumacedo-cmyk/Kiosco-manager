import { headers } from "next/headers";
import CajaClient from "./CajaClient";

export default async function CajaPage() {
  const headersList = await headers();
  const role = (headersList.get("x-user-role") ?? "cajero") as "admin" | "cajero";
  const userId = headersList.get("x-user-id") ?? null;
  return <CajaClient role={role} userId={userId} />;
}
