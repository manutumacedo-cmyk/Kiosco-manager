import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/apiAuth";
import { checkOut } from "@/lib/services/attendance";
import { notificarAsistencia } from "@/lib/services/notifications";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const closed = await checkOut(user.sub);
    if (!closed) {
      return NextResponse.json(
        { error: "No tenías una entrada abierta" },
        { status: 409 }
      );
    }

    try {
      await notificarAsistencia({
        userId: user.sub,
        username: user.username,
        tipo: "salida",
        fecha: new Date(closed.check_out ?? new Date().toISOString()),
        desde: closed.check_in,
      });
    } catch (error) {
      console.error("No se pudo avisar la salida:", error);
    }

    return NextResponse.json({ closed });
  } catch (error) {
    console.error("Error marcando salida:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
