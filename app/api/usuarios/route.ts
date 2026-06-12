import { NextRequest, NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/services/users";

export async function GET() {
  try {
    const users = await listUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error listando usuarios:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const createdBy = request.headers.get("x-user-id") ?? "unknown";
    const { username, password, role } = await request.json();

    if (!username?.trim() || !password || !role) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }
    if (!["admin", "cajero"].includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const user = await createUser(username.trim(), password, role, createdBy);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error del servidor";
    const status = msg.includes("duplicate") || msg.includes("unique") ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
