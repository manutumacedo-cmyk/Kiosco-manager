import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/apiAuth";
import { getOpenAttendance } from "@/lib/services/attendance";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const open = await getOpenAttendance(user.sub);
    return NextResponse.json({ open });
  } catch (error) {
    console.error("Error consultando asistencia:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
