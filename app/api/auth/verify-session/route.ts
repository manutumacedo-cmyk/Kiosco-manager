import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/services/authService";
import { supabaseServer } from "@/lib/supabaseServer";

const AUTH_COOKIE_NAME = "24siete_auth_token";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const [{ data: user }, { data: session }] = await Promise.all([
    supabaseServer
      .from("users")
      .select("id")
      .eq("id", payload.sub)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    supabaseServer
      .from("user_sessions")
      .select("id")
      .eq("id", payload.sid)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  ]);

  if (!user || !session) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
