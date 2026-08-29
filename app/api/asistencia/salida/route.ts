import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/apiAuth";
import { checkOut } from "@/lib/services/attendance";

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
    return NextResponse.json({ closed });
  } catch (error) {
    console.error("Error marcando salida:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
