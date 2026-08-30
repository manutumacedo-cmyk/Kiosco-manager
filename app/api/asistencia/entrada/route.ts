import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/services/apiAuth";
import { checkIn } from "@/lib/services/attendance";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const record = await checkIn(user.sub);
    return NextResponse.json({ open: record });
  } catch (error) {
    console.error("Error marcando entrada:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
