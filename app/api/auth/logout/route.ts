import { NextResponse } from "next/server";
import { clearAuthCookie, getAuthCookie, verifyToken } from "@/lib/services/authService";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST() {
  try {
    const token = await getAuthCookie();
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        await supabaseServer
          .from("user_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", payload.sid);
      }
    }

    await clearAuthCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en logout:", error);
    return NextResponse.json(
      { error: "Error del servidor" },
      { status: 500 }
    );
  }
}
