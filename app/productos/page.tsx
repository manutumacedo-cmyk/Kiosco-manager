import { headers } from "next/headers";
import ProductosClient from "./ProductosClient";

export default async function ProductosPage() {
  const headersList = await headers();
  const role = (headersList.get("x-user-role") ?? "cajero") as "admin" | "cajero";
  return <ProductosClient role={role} />;
}
