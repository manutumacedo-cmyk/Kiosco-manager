import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/apiAuth";
import { listAttendance } from "@/lib/services/attendance";

// Historial completo: solo admin. Las rutas de entrada/salida/estado sí son
// para cualquier usuario logueado (los cajeros marcan su propia asistencia).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
    }
    const records = await listAttendance();
    return NextResponse.json(records);
  } catch (error) {
    console.error("Error listando asistencia:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
