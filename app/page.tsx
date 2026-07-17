import Link from "next/link";
import { headers } from "next/headers";
import BrandMark from "@/components/BrandMark";
import CajaStatusLine from "@/components/CajaStatusLine";
import {
  BoxIcon,
  CashboxIcon,
  ComboIcon,
  ChartIcon,
  HistoryIcon,
  UsersIcon,
  PlayIcon,
} from "@/components/Icons";

type Role = "admin" | "cajero";
type Accent = "cyan" | "magenta";

interface NavItem {
  href: string;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
  accent: Accent;
  roles: Role[];
}

// La acción primaria (VENDER) vive aparte, encendida y full-width: es el trabajo
// del cajero. El resto son destinos secundarios, sobrios, agrupados por rol.
const SECONDARY: NavItem[] = [
  { href: "/productos", title: "Productos", description: "Inventario y reposición", Icon: BoxIcon, accent: "cyan", roles: ["admin", "cajero"] },
  { href: "/caja", title: "Caja", description: "Apertura y cierre de turno", Icon: CashboxIcon, accent: "cyan", roles: ["admin", "cajero"] },
  { href: "/combos", title: "Combos", description: "Combos y tipo de cambio", Icon: ComboIcon, accent: "magenta", roles: ["admin", "cajero"] },
  { href: "/reportes/hoy", title: "Reportes", description: "Dashboard y ganancia limpia", Icon: ChartIcon, accent: "magenta", roles: ["admin"] },
  { href: "/reportes/ventas", title: "Historial", description: "Ventas y cancelaciones", Icon: HistoryIcon, accent: "cyan", roles: ["admin"] },
  { href: "/usuarios", title: "Usuarios", description: "Cuentas y roles", Icon: UsersIcon, accent: "magenta", roles: ["admin"] },
];

export default async function Home() {
  const headersList = await headers();
  const role = (headersList.get("x-user-role") ?? "cajero") as Role;
  const items = SECONDARY.filter((i) => i.roles.includes(role));

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] px-6 py-10 md:py-14">
      <div className="mx-auto w-full max-w-3xl">

        {/* Marca */}
        <header className="flex flex-col items-center gap-4 text-center">
          <BrandMark className="text-[20px] md:text-[24px]" />
          <p className="font-mono text-sm tracking-wide text-[var(--text-secondary)]">
            TU SED NO TIENE HORARIO, NOSOTROS TAMPOCO.
          </p>
        </header>

        {/* Acción primaria — VENDER, encendida */}
        <Link
          href="/ventas/nueva"
          className="group mt-10 flex items-center gap-5 rounded-2xl border-2 border-[var(--neon-magenta)] bg-[var(--magenta-glow)] px-6 py-6 shadow-[0_0_22px_var(--magenta-glow)] transition-all duration-150 hover:bg-[var(--neon-magenta)] hover:shadow-[0_0_34px_var(--magenta-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-magenta)] active:scale-[0.99] motion-reduce:transition-none"
        >
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--neon-magenta)]/50 text-[var(--neon-magenta)] group-hover:border-[var(--deep-dark)]/30 group-hover:text-[var(--deep-dark)]">
            <PlayIcon size={28} />
          </span>
          <span className="min-w-0">
            <span className="block text-3xl font-bold uppercase tracking-widest text-[var(--neon-magenta)] group-hover:text-[var(--deep-dark)]">
              Vender
            </span>
            <span className="mt-1 block group-hover:text-[var(--deep-dark)]/80">
              <CajaStatusLine />
            </span>
          </span>
          <span className="ml-auto flex-shrink-0 text-2xl text-[var(--neon-magenta)] transition-transform duration-150 group-hover:translate-x-1 group-hover:text-[var(--deep-dark)] motion-reduce:transition-none">
            →
          </span>
        </Link>

        {/* Destinos secundarios — sobrios, glow solo en hover */}
        <nav className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map(({ href, title, description, Icon, accent }) => {
            const accentVar = accent === "cyan" ? "--neon-cyan" : "--neon-magenta";
            return (
              <Link
                key={href}
                href={href}
                className="group flex min-h-[64px] items-center gap-4 rounded-xl border border-[var(--slate-gray)] bg-[var(--carbon-gray)] px-4 py-3 transition-all duration-150 hover:border-[var(--accent)] hover:shadow-[0_0_14px_-2px_var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-[0.99] motion-reduce:transition-none"
                style={{ ["--accent" as string]: `var(${accentVar})` }}
              >
                <span className="flex-shrink-0 text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent)]">
                  <Icon size={26} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-[var(--text-primary)]">{title}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{description}</span>
                </span>
              </Link>
            );
          })}
        </nav>

      </div>
    </div>
  );
}
