import { NextRequest, NextResponse } from "next/server";
import { createToken, setAuthCookie } from "@/lib/services/authService";
import { verifyCredentials } from "@/lib/services/users";
import { supabaseServer } from "@/lib/supabaseServer";
import { notificarLoginFueraDeHorario } from "@/lib/services/notifications";
import { estaEnHorario } from "@/lib/horarioKiosco";
import { getOpenAttendance } from "@/lib/services/attendance";
import { LLEGADA_PENDIENTE_COOKIE } from "@/lib/services/authService";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS = 5;
const TOKEN_MAX_AGE_LLEGADA = 60 * 60 * 8; // igual que la sesión

async function isRateLimited(username: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [byUser, byIp] = await Promise.all([
    supabaseServer
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("username", username)
      .eq("success", false)
      .gte("attempted_at", since),
    supabaseServer
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("success", false)
      .gte("attempted_at", since),
  ]);
  return (byUser.count ?? 0) >= MAX_ATTEMPTS || (byIp.count ?? 0) >= MAX_ATTEMPTS;
}

async function logAttempt(username: string, ip: string, success: boolean) {
  await supabaseServer
    .from("login_attempts")
    .insert({ username, ip_address: ip, success });
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      "unknown";

    const { username: rawUsername, password } = await request.json();
    const username = typeof rawUsername === "string" ? rawUsername.trim() : rawUsername;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Usuario y contraseña son requeridos" },
        { status: 400 }
      );
    }

    if (await isRateLimited(username, ip)) {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Esperá 15 minutos e intentá de nuevo." },
        { status: 429 }
      );
    }

    const user = await verifyCredentials(username, password);
    const success = user !== null;

    await logAttempt(username, ip, success);

    if (!success) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const { data: session, error: sessionError } = await supabaseServer
      .from("user_sessions")
      .insert({
        user_id: user.id,
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        ip_address: ip,
        user_agent: request.headers.get("user-agent"),
      })
      .select("id")
      .single();
    if (sessionError || !session) {
      throw new Error(sessionError?.message ?? "No se pudo crear la sesión");
    }

    // M11 — aviso de login fuera del horario de trabajo (18:30-03:30, hora de Rivera).
    // Solo cajeros: el dueño entra a cualquier hora a mirar reportes y notificar eso
    // sería ruido que tapa las alertas que importan. Va en try/catch: si el insert
    // falla, el cajero entra igual — que la caja no se trabe en hora pico está por
    // encima de registrar la alerta.
    const ahora = new Date();
    if (user.role === "cajero" && !estaEnHorario(ahora)) {
      try {
        await notificarLoginFueraDeHorario({
          userId: user.id,
          username: user.username,
          fecha: ahora,
          ip,
          userAgent: request.headers.get("user-agent"),
        });
      } catch (error) {
        console.error("No se pudo registrar el aviso de login fuera de horario:", error);
      }
    }

    const token = await createToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      sid: session.id,
    });
    await setAuthCookie(token);

    // Marcar la llegada es obligatorio al iniciar sesión (M12). Si ya hay una
    // entrada abierta no se vuelve a pedir: en el POS compartido el mismo
    // cajero se desloguea y loguea varias veces por noche, y ya está en el local.
    let llegadaPendiente = false;
    try {
      llegadaPendiente = (await getOpenAttendance(user.id)) === null;
    } catch (error) {
      // Si no se puede consultar, no se traba el ingreso: prioridad #1 es que
      // la caja funcione. Se pedirá en el próximo login.
      console.error("No se pudo consultar la asistencia abierta:", error);
    }

    const response = NextResponse.json({
      success: true,
      role: user.role,
      llegadaPendiente,
    });
    if (llegadaPendiente) {
      response.cookies.set(LLEGADA_PENDIENTE_COOKIE, "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: TOKEN_MAX_AGE_LLEGADA,
        path: "/",
      });
    }
    return response;
  } catch (error) {
    console.error("Error en login:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
