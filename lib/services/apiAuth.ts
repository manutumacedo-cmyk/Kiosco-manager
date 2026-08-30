import { getAuthCookie, verifyToken, type TokenPayload } from "@/lib/services/authService";

/**
 * Usuario autenticado de la request actual, verificando el JWT de la cookie.
 * Los headers x-user-* que inyecta el middleware sirven para Server
 * Components; en route handlers preferimos re-verificar la firma acá.
 */
export async function getCurrentUser(): Promise<TokenPayload | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}
