"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, HistoryIcon, CashFlowIcon } from "@/components/Icons";

// Reportes es una rama: tres hojas sobre el mismo dato (las ventas de un turno).
// El dashboard agrega, el historial lista ticket por ticket, movimientos muestra
// la plata que entra y sale por fuera de las ventas.
const HOJAS = [
  { href: "/reportes/hoy", label: "Dashboard", Icon: ChartIcon },
  { href: "/reportes/ventas", label: "Historial", Icon: HistoryIcon },
  { href: "/reportes/movimientos", label: "Movimientos", Icon: CashFlowIcon },
];

export default function ReportesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-[var(--slate-gray)] bg-[var(--deep-dark)] px-4 py-2 md:px-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          {HOJAS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[36px] flex-shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-cyan)] motion-reduce:transition-none ${
                  active
                    ? "border border-[var(--neon-cyan)] text-[var(--neon-cyan)] shadow-[0_0_12px_-2px_var(--neon-cyan)]"
                    : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]"
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </>
  );
}
