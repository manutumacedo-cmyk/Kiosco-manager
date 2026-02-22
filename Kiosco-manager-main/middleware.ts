import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "24siete_auth_token";

/**
 * Obtiene el secret desde las variables de entorno
 */
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurado en .env");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verifica si el token es válido
 */
async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

/**
 * Middleware que protege todas las rutas excepto /login y /api/auth/*
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir acceso a /login y rutas de autenticación
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Obtener token de las cookies
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  // Si no hay token, redirigir a login
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verificar que el token sea válido
  const isValid = await verifyToken(token);

  if (!isValid) {
    // Token inválido, borrar cookie y redirigir a login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  // Token válido, permitir acceso
  return NextResponse.next();
}

/**
 * Configuración del middleware: aplicar a todas las rutas excepto archivos estáticos
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
