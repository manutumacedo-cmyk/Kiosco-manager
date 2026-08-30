import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { UserRole } from "@/lib/services/users";

const AUTH_COOKIE_NAME = "24siete_auth_token";
const SESSION_CHECK_COOKIE_NAME = "24siete_session_check";
const LLEGADA_PENDIENTE_COOKIE = "24siete_llegada_pendiente";

// Rutas que siguen funcionando con la llegada sin marcar. Sin esta lista el
// gate se muerde la cola: la propia pantalla de llegada y el endpoint que la
// registra quedarían bloqueados por el gate que vienen a levantar.
const LLEGADA_EXENTAS = [
  "/perfil/llegada",
  "/api/asistencia/entrada",
  "/api/asistencia/estado",
  "/api/auth/logout",
];
const SESSION_CHECK_INTERVAL_MS = 3 * 60 * 1000; // revalidar sesión contra la DB cada ~3 min

// Rutas accesibles solo por admin (páginas y API routes bajo ese prefijo)
// Ojo: "/asistencia" (página de historial) es solo admin, pero
// "/api/asistencia/..." NO está acá — los cajeros marcan entrada/salida por
// esas rutas; el GET del historial chequea el rol dentro del handler.
const ADMIN_ONLY_ROUTES = [
  "/reportes",
  "/historial",
  "/usuarios",
  "/api/usuarios",
  "/api/notificaciones", // M11 — avisos del negocio, solo el dueño los ve
  "/asistencia",
];

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está configurado");
  return new TextEncoder().encode(secret);
}

interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  sid: string;
}

async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as UserRole,
      sid: payload.sid as string,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Solo el endpoint de login es público. /api/auth/verify-session también
  // queda afuera de este gate: es el propio endpoint que la revalidación
  // periódica de abajo llama por fetch, y hace su propia verificación
  // completa (firma + DB) — si no lo excluimos acá, esa request interna
  // volvería a pasar por este middleware y dispararía un loop.
  if (
    pathname.startsWith("/login") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/verify-session"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    response.cookies.delete(SESSION_CHECK_COOKIE_NAME);
    return response;
  }

  // Verificar acceso por rol
  const isAdminOnly = ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminOnly && payload.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Marcar la llegada al local es obligatorio al iniciar sesión (M12). La
  // cookie la pone el login cuando no hay una entrada abierta y la borra el
  // POST de entrada. Se chequea acá, con la cookie y sin tocar la base, porque
  // el middleware corre en Edge y en cada request.
  const llegadaPendiente =
    request.cookies.get(LLEGADA_PENDIENTE_COOKIE)?.value === "1";
  if (llegadaPendiente && !LLEGADA_EXENTAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/perfil/llegada", request.url));
  }

  // Revalidación periódica: la firma del JWT ya se verificó arriba sin tocar
  // la DB. Cada ~3 min, además, confirmamos contra la DB que la cuenta sigue
  // activa/no eliminada y que la sesión no fue cerrada (logout) ni eliminada
  // por un admin. supabaseServer no se puede usar acá (Edge Runtime), por
  // eso se llama por fetch a un route handler que sí puede.
  const lastCheck = Number(request.cookies.get(SESSION_CHECK_COOKIE_NAME)?.value ?? 0);
  const needsRevalidation = Date.now() - lastCheck >= SESSION_CHECK_INTERVAL_MS;
  let refreshSessionCheck = false;

  if (needsRevalidation) {
    try {
      const verifyRes = await fetch(new URL("/api/auth/verify-session", request.url), {
        headers: { cookie: request.headers.get("cookie") ?? "" },
      });
      if (!verifyRes.ok) {
        const response = NextResponse.redirect(new URL("/login", request.url));
        response.cookies.delete(AUTH_COOKIE_NAME);
        response.cookies.delete(SESSION_CHECK_COOKIE_NAME);
        return response;
      }
      refreshSessionCheck = true;
    } catch (error) {
      // Fail-open: un error de red interno no debe frenar la caja en hora
      // pico. Se reintenta en la próxima request.
      console.error("Error revalidando sesión:", error);
    }
  }

  // Inyectar rol e id en headers para que los Server Components los lean sin re-decodificar
  const response = NextResponse.next();
  response.headers.set("x-user-role", payload.role);
  response.headers.set("x-user-id", payload.sub);
  response.headers.set("x-user-name", payload.username);
  if (refreshSessionCheck) {
    response.cookies.set(SESSION_CHECK_COOKIE_NAME, String(Date.now()), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
