import Link from "next/link";
import { headers } from "next/headers";
import BrandMark from "@/components/BrandMark";

interface MenuCard {
  href: string;
  title: string;
  description: string;
  icon: string;
  color: "cyan" | "magenta";
  roles: ("admin" | "cajero")[];
}

const MENU_CARDS: MenuCard[] = [
  {
    href: "/ventas/nueva",
    title: "Nueva Venta",
    description: "Punto de venta (POS)",
    icon: "🛒",
    color: "magenta",
    roles: ["admin", "cajero"],
  },
  {
    href: "/productos",
    title: "Productos",
    description: "Gestión de inventario y reposición",
    icon: "📦",
    color: "cyan",
    roles: ["admin", "cajero"],
  },
  {
    href: "/caja",
    title: "Caja",
    description: "Apertura y cierre de turno",
    icon: "💰",
    color: "magenta",
    roles: ["admin", "cajero"],
  },
  {
    href: "/combos",
    title: "Combos",
    description: "Administrar combos y tipo de cambio",
    icon: "🎁",
    color: "cyan",
    roles: ["admin"],
  },
  {
    href: "/reportes/hoy",
    title: "Reportes",
    description: "Dashboard y ganancia limpia",
    icon: "📊",
    color: "magenta",
    roles: ["admin"],
  },
  {
    href: "/reportes/ventas",
    title: "Historial",
    description: "Ventas anteriores y cancelaciones",
    icon: "📋",
    color: "cyan",
    roles: ["admin"],
  },
  {
    href: "/usuarios",
    title: "Usuarios",
    description: "Gestión de cuentas y roles",
    icon: "👥",
    color: "magenta",
    roles: ["admin"],
  },
];

export default async function Home() {
  const headersList = await headers();
  const role = (headersList.get("x-user-role") ?? "cajero") as "admin" | "cajero";

  const visibleCards = MENU_CARDS.filter((card) => card.roles.includes(role));

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-6 py-12">
          <div className="flex items-center justify-center">
            <BrandMark className="text-[22px] md:text-[26px]" />
          </div>
          <p className="text-[var(--text-secondary)] text-lg font-mono">
            TU SED NO TIENE HORARIO, NOSOTROS TAMPOCO.
          </p>
        </div>

        {/* Menu Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`
                data-card group cursor-pointer
                ${card.color === "cyan" ? "neon-hover-cyan" : "neon-hover-magenta"}
              `}
            >
              <div className="space-y-3">
                <div className="text-5xl">{card.icon}</div>
                <h2
                  className={`text-2xl font-bold ${
                    card.color === "cyan"
                      ? "text-[var(--neon-cyan)]"
                      : "text-[var(--neon-magenta)]"
                  }`}
                >
                  {card.title}
                </h2>
                <p className="text-[var(--text-secondary)]">{card.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Info Footer */}
        <div className="text-center pt-12">
          <div className="inline-block border border-[var(--slate-gray)] rounded-lg px-6 py-3">
            <p className="text-[var(--text-muted)] text-sm font-mono">
              Presiona cualquier tarjeta para comenzar
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
