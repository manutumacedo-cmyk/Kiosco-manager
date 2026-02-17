/**
 * =========================================================
 * 24 SIETE - SERVICIO DE AUTENTICACIÓN
 * =========================================================
 * Maneja login, logout y validación de credenciales
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "24siete_auth_token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 días en segundos

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
 * Verifica si las credenciales son correctas
 */
export function validateCredentials(username: string, password: string): boolean {
  const validUsername = process.env.AUTH_USERNAME;
  const validPassword = process.env.AUTH_PASSWORD;

  if (!validUsername || !validPassword) {
    console.error("AUTH_USERNAME o AUTH_PASSWORD no están configurados");
    return false;
  }

  return username === validUsername && password === validPassword;
}

/**
 * Crea un token JWT firmado
 */
export async function createToken(username: string): Promise<string> {
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE}s`)
    .sign(getSecret());

  return token;
}

/**
 * Verifica y decodifica un token JWT
 */
export async function verifyToken(token: string): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { username: payload.username as string };
  } catch (error) {
    console.error("Token inválido:", error);
    return null;
  }
}

/**
 * Guarda el token en una cookie HTTP-only (server-side)
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_MAX_AGE,
    path: "/",
  });
}

/**
 * Obtiene el token desde la cookie (server-side)
 */
export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

/**
 * Elimina la cookie de autenticación (logout)
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Verifica si el usuario está autenticado (middleware / server components)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthCookie();
  if (!token) return false;

  const payload = await verifyToken(token);
  return payload !== null;
}
