import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/apiAuth";
import { checkIn, getOpenAttendance } from "@/lib/services/attendance";
import { notificarAsistencia } from "@/lib/services/notifications";
import { LLEGADA_PENDIENTE_COOKIE } from "@/lib/services/authService";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Si ya habia una entrada abierta, checkIn la devuelve tal cual y no
    // notificamos de nuevo: el aviso es de la llegada, no de cada toque.
    const yaAbierta = await getOpenAttendance(user.sub);
    const record = await checkIn(user.sub);

    if (!yaAbierta) {
      try {
        await notificarAsistencia({
          userId: user.sub,
          username: user.username,
          tipo: "entrada",
          fecha: new Date(record.check_in),
        });
      } catch (error) {
        // El aviso es para el duenio; que falle no puede impedir que el cajero
        // entre a trabajar.
        console.error("No se pudo avisar la llegada:", error);
      }
    }

    // La llegada ya esta marcada: se levanta el gate que bloquea la app.
    const res = NextResponse.json({ open: record });
    res.cookies.delete(LLEGADA_PENDIENTE_COOKIE);
    return res;
  } catch (error) {
    console.error("Error marcando entrada:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
