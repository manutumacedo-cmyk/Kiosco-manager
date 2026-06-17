"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { getOpenSession } from "@/lib/services/cashSessions";
import {
  CartIcon,
  BoxIcon,
  CashboxIcon,
  ComboIcon,
  ChartIcon,
  HistoryIcon,
  UsersIcon,
  LogoutIcon,
} from "./Icons";

type Role = "admin" | "cajero";
type Accent = "cyan" | "magenta";

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
  accent: Accent;
  roles: Role[];
}

// Todas las opciones del home, en la barra de arriba. Acentos espejados con el
// launcher del home para que la navegación se sienta una sola cosa.
const NAV_ITEMS: NavItem[] = [
  { href: "/ventas/nueva", label: "Nueva Venta", Icon: CartIcon, accent: "magenta", roles: ["admin", "cajero"] },
  { href: "/productos", label: "Productos", Icon: BoxIcon, accent: "cyan", roles: ["admin", "cajero"] },
  { href: "/combos", label: "Combos", Icon: ComboIcon, accent: "magenta", roles: ["admin"] },
  { href: "/reportes/hoy", label: "Reportes", Icon: ChartIcon, accent: "magenta", roles: ["admin"] },
  { href: "/reportes/ventas", label: "Historial", Icon: HistoryIcon, accent: "cyan", roles: ["admin"] },
  { href: "/usuarios", label: "Usuarios", Icon: UsersIcon, accent: "magenta", roles: ["admin"] },
];

interface Props {
  role: Role;
}

export default function CyberNav({ role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(false);

  useEffect(() => {
    getOpenSession()
      .then((s) => setCajaAbierta(!!s))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      setLoggingOut(false);
    }
  }

  if (pathname.startsWith("/login")) return null;

  // /reportes/hoy y /reportes/ventas comparten prefijo: matcheo exacto del segmento
  // para que "Reportes" e "Historial" no queden activos los dos a la vez.
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="border-b border-[var(--slate-gray)] bg-[var(--carbon-gray)] px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-y-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="text-2xl font-bold leading-none md:text-3xl">
            <span className="neon-text-cyan">24</span>
            <span className="neon-text-magenta"> SIETE</span>
          </div>
          <Image src="/logo.png" alt="24 SIETE" width={32} height={32} />
        </Link>

        {/* Navegación */}
        <div className="flex flex-wrap items-center gap-2">
          {visible.map(({ href, label, Icon, accent }) => {
            const accentVar = accent === "cyan" ? "--neon-cyan" : "--neon-magenta";
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                style={{ ["--accent" as string]: `var(${accentVar})` }}
                className={`flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                  active
                    ? "border border-[var(--accent)] text-[var(--accent)] shadow-[0_0_12px_-2px_var(--accent)]"
                    : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}

          {/* Caja — con indicador de turno abierto */}
          <Link
            href="/caja"
            aria-current={isActive("/caja") ? "page" : undefined}
            style={{ ["--accent" as string]: "var(--neon-cyan)" }}
            className={`flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
              isActive("/caja")
                ? "border border-[var(--accent)] text-[var(--accent)] shadow-[0_0_12px_-2px_var(--accent)]"
                : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            <CashboxIcon size={20} className="flex-shrink-0" />
            <span className="hidden md:inline">Caja</span>
            {cajaAbierta && (
              <span
                className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)] motion-safe:animate-pulse"
                title="Caja abierta"
              />
            )}
          </Link>

          {/* Salir */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Cerrar sesión"
            className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--error)] px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[var(--error)] transition-all duration-150 hover:bg-[var(--error)] hover:text-[var(--dark-bg)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--error)] motion-reduce:transition-none"
          >
            <LogoutIcon size={20} className="flex-shrink-0" />
            <span className="hidden md:inline">{loggingOut ? "..." : "Salir"}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
