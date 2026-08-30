import { NextRequest, NextResponse } from "next/server";
import { marcarLeida } from "@/lib/services/notifications";

/** PATCH /api/notificaciones/[id] → marca una notificación como leída. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = request.headers.get("x-user-id");
    if (!adminId) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }
    const { id } = await params;
    await marcarLeida(id, adminId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marcando notificación como leída:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
