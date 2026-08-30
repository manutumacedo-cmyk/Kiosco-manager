import Link from "next/link";
import Image from "next/image";
import { listAttendance } from "@/lib/services/attendance";
import AsistenciaClient from "./AsistenciaClient";

export const dynamic = "force-dynamic";

export default async function AsistenciaPage() {
  const records = await listAttendance();

  return (
    <div className="min-h-full bg-[var(--deep-dark)] p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
        </Link>
        <h1 className="text-3xl font-bold neon-text-cyan">ASISTENCIA</h1>
        <div className="text-2xl">🕐</div>
      </div>

      <AsistenciaClient initialRecords={records} />
    </div>
  );
}
