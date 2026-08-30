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
  { href: "/perfil", label: "Mi perfil", Icon: AttendanceIcon, accent: "cyan", roles: ["admin", "cajero"] },
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
  // Panel previo al logout (M12): antes de salir se ofrece marcar la salida.
  const [preguntandoSalida, setPreguntandoSalida] = useState(false);
  const [asistenciaAbierta, setAsistenciaAbierta] = useState<{ check_in: string } | null>(null);

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

  /**
   * Salir no es lo mismo que irse del local: en el POS compartido uno se
   * desloguea para que opere otro y sigue trabajando. Por eso antes de cerrar
   * sesión se pregunta, en vez de marcar la salida sola. Marcarla es opcional.
   */
  async function handleLogout() {
    if (loggingOut || preguntandoSalida) return;
    try {
      const res = await fetch("/api/asistencia/estado");
      const data = res.ok ? await res.json() : null;
      if (data?.open) {
        setAsistenciaAbierta(data.open);
        setPreguntandoSalida(true);
        return;
      }
    } catch (error) {
      // Si no se puede consultar, no se traba la salida: se cierra sesión.
      console.error("No se pudo consultar la asistencia:", error);
    }
    await cerrarSesion();
  }

  async function cerrarSesion(marcarSalida = false) {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (marcarSalida) {
        await fetch("/api/asistencia/salida", { method: "POST" });
      }
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      setLoggingOut(false);
      setPreguntandoSalida(false);
    }
  }

  // La pantalla de llegada es bloqueante: sin la barra, porque cualquier link
  // de ahí rebota contra el gate y solo invita a tocar lo que no va a andar.
  if (pathname.startsWith("/login") || pathname.startsWith("/perfil/llegada")) return null;

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

          {/* Asistencia — el estado se ve acá, se marca en /perfil */}
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

        {/* Antes de cerrar sesión: ¿marcás también la salida del local? */}
        {preguntandoSalida && asistenciaAbierta && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="data-card w-full max-w-sm space-y-4 border-[var(--warning)]">
              <h2 className="text-lg font-bold uppercase tracking-wide text-[var(--warning)]">
                ¿Te vas del local?
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Estás marcado en el local desde las{" "}
                <span className="font-bold text-[var(--text-primary)]">
                  {new Intl.DateTimeFormat("es-UY", {
                    timeZone: "America/Montevideo",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date(asistenciaAbierta.check_in))}
                </span>
                . Si seguís trabajando y solo cerrás sesión para que entre otro, salí sin marcar.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => cerrarSesion(true)}
                  disabled={loggingOut}
                  className="min-h-[48px] w-full rounded-lg border-2 border-[var(--warning)] px-3 py-2 text-sm font-bold uppercase tracking-wide text-[var(--warning)] transition-all hover:bg-[rgba(255,170,0,0.1)] disabled:opacity-40"
                >
                  {loggingOut ? "Saliendo..." : "Marcar salida y cerrar sesión"}
                </button>
                <button
                  onClick={() => cerrarSesion(false)}
                  disabled={loggingOut}
                  className="min-h-[48px] w-full rounded-lg border border-[var(--slate-gray)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-all hover:border-[var(--error)] hover:text-[var(--error)] disabled:opacity-40"
                >
                  Cerrar sesión sin marcar salida
                </button>
                <button
                  onClick={() => setPreguntandoSalida(false)}
                  disabled={loggingOut}
                  className="min-h-[40px] w-full text-xs uppercase tracking-wide text-[var(--text-muted)] transition-all hover:text-[var(--text-secondary)] disabled:opacity-40"
                >
                  Cancelar, me quedo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
