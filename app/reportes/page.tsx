import { redirect } from "next/navigation";

// La rama sola no muestra nada: entra por su primera hoja.
export default function ReportesPage() {
  redirect("/reportes/hoy");
}
