import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { UserRole } from "@/lib/services/users";

const AUTH_COOKIE_NAME = "24siete_auth_token";

// Rutas accesibles solo por admin (páginas y API routes bajo ese prefijo)
const ADMIN_ONLY_ROUTES = ["/reportes", "/historial", "/usuarios", "/api/usuarios"];

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está configurado");
  return new TextEncoder().encode(secret);
}

interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Solo el endpoint de login es público
  if (pathname.startsWith("/login") || pathname === "/api/auth/login") {
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
    return response;
  }

  // Verificar acceso por rol
  const isAdminOnly = ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminOnly && payload.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Inyectar rol e id en headers para que los Server Components los lean sin re-decodificar
  const response = NextResponse.next();
  response.headers.set("x-user-role", payload.role);
  response.headers.set("x-user-id", payload.sub);
  response.headers.set("x-user-name", payload.username);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
