import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@/lib/services/users";

const AUTH_COOKIE_NAME = "24siete_auth_token";
const TOKEN_MAX_AGE = 60 * 60 * 8; // 8 horas (duración de un turno)

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está configurado en .env");
  return new TextEncoder().encode(secret);
}

export interface TokenPayload {
  sub: string;
  username: string;
  role: UserRole;
}

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
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

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthCookie();
  if (!token) return false;
  return (await verifyToken(token)) !== null;
}
