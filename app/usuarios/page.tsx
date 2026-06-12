import { headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { listUsers } from "@/lib/services/users";
import UsuariosClient from "./UsuariosClient";

export default async function UsuariosPage() {
  const headersList = await headers();
  const currentUserId = headersList.get("x-user-id") ?? "";

  const users = await listUsers();

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
        </Link>
        <h1 className="text-3xl font-bold neon-text-magenta">USUARIOS</h1>
        <div className="text-2xl">👥</div>
      </div>

      <UsuariosClient initialUsers={users} currentUserId={currentUserId} />
    </div>
  );
}
