import { headers } from "next/headers";
import CyberNav from "./CyberNav";

export default async function AppNav() {
  const headersList = await headers();
  const role = (headersList.get("x-user-role") ?? "cajero") as "admin" | "cajero";
  return <CyberNav role={role} />;
}
