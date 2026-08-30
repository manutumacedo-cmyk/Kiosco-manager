import { NextRequest, NextResponse } from "next/server";
import {
  listarNotificaciones,
  contarNoLeidas,
  marcarTodasLeidas,
} from "@/lib/services/notifications";

// Admin-only: el gate está en middleware.ts (ADMIN_ONLY_ROUTES incluye /api/notificaciones).

/**
 * GET /api/notificaciones            → lista (100 más recientes)
 * GET /api/notificaciones?noLeidas=1 → solo las no leídas
 * GET /api/notificaciones?count=1    → { count } — lo usa el badge del nav
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    if (params.get("count")) {
      return NextResponse.json({ count: await contarNoLeidas() });
    }

    const notificaciones = await listarNotificaciones({
      soloNoLeidas: params.get("noLeidas") === "1",
    });
    return NextResponse.json(notificaciones);
  } catch (error) {
    console.error("Error listando notificaciones:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/** PATCH /api/notificaciones → marca todas como leídas. */
export async function PATCH(request: NextRequest) {
  try {
    const adminId = request.headers.get("x-user-id");
    if (!adminId) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }
    const marcadas = await marcarTodasLeidas(adminId);
    return NextResponse.json({ marcadas });
  } catch (error) {
    console.error("Error marcando notificaciones como leídas:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
