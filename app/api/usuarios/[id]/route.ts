import { NextRequest, NextResponse } from "next/server";
import { toggleUserActive, resetPassword } from "@/lib/services/users";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if ("active" in body) {
      await toggleUserActive(id, Boolean(body.active));
      return NextResponse.json({ ok: true });
    }

    if ("password" in body) {
      if (!body.password || body.password.length < 6) {
        return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
      }
      await resetPassword(id, body.password);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error) {
    console.error("Error en PATCH /api/usuarios/[id]:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
