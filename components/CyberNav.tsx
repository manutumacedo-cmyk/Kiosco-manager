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
  UsersIcon,
  AttendanceIcon,
  LogoutIcon,
} from "./Icons";
import AttendanceControl from "./AttendanceControl";

type Role = "admin" | "cajero";
type Accent = "cyan" | "magenta";

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
  accent: Accent;
  roles: Role[];
  /** Prefijo para marcar activo cuando la rama tiene hojas (ej. Reportes). */
  activePrefix?: string;
  /** Muestra el contador de avisos sin leer (M11). Solo en Reportes. */
  badgeNotificaciones?: boolean;
}

// Todas las opciones del home, en la barra de arriba. Acentos espejados con el
// launcher del home para que la navegación se sienta una sola cosa.
const NAV_ITEMS: NavItem[] = [
  { href: "/ventas/nueva", label: "Nueva Venta", Icon: CartIcon, accent: "magenta", roles: ["admin", "cajero"] },
  { href: "/productos", label: "Productos", Icon: BoxIcon, accent: "cyan", roles: ["admin", "cajero"] },
  { href: "/combos", label: "Combos", Icon: ComboIcon, accent: "magenta", roles: ["admin", "cajero"] },
  { href: "/reportes/hoy", label: "Reportes", Icon: ChartIcon, accent: "magenta", roles: ["admin"], activePrefix: "/reportes", badgeNotificaciones: true },
  { href: "/usuarios", label: "Usuarios", Icon: UsersIcon, accent: "magenta", roles: ["admin"] },
  { href: "/asistencia", label: "Asistencia", Icon: AttendanceIcon, accent: "cyan", roles: ["admin"] },
];

interface Props {
  role: Role;
}

export default function CyberNav({ role }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [avisosSinLeer, setAvisosSinLeer] = useState(0);

  useEffect(() => {
    getOpenSession()
      .then((s) => setCajaAbierta(!!s))
      .catch(() => {});
  }, []);

  // Avisos del negocio sin leer (M11). Solo el admin los tiene: para el cajero el
  // endpoint está cerrado por middleware, así que ni se pide. Se lee al montar el nav
  // — alcanza para que el dueño se entere sin tener que entrar a buscar.
  useEffect(() => {
    if (role !== "admin") return;
    fetch("/api/notificaciones?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAvisosSinLeer(d?.count ?? 0))
      .catch(() => {});
  }, [role, pathname]);

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

  // Una rama queda activa en cualquiera de sus hojas (activePrefix); una hoja suelta,
  // solo en su propia ruta y sus sub-rutas.
  const isActive = (href: string, activePrefix?: string) =>
    activePrefix
      ? pathname === activePrefix || pathname.startsWith(activePrefix + "/")
      : pathname === href || pathname.startsWith(href + "/");

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <nav className="border-b border-[var(--slate-gray)] bg-[var(--carbon-gray)] px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-y-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="24 SIETE" width={44} height={44} />
        </Link>

        {/* Navegación */}
        <div className="flex flex-wrap items-center gap-2">
          {visible.map(({ href, label, Icon, accent, activePrefix, badgeNotificaciones }) => {
            const accentVar = accent === "cyan" ? "--neon-cyan" : "--neon-magenta";
            const active = isActive(href, activePrefix);
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
                {badgeNotificaciones && avisosSinLeer > 0 && (
                  <span
                    className="min-w-[18px] rounded-full bg-[var(--error)] px-1.5 text-center text-[11px] font-bold leading-[18px] text-white"
                    title={`${avisosSinLeer} aviso${avisosSinLeer === 1 ? "" : "s"} sin leer`}
                  >
                    {avisosSinLeer > 99 ? "99+" : avisosSinLeer}
                  </span>
                )}
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

          {/* Asistencia — marcar entrada/salida del local */}
          <AttendanceControl />

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
