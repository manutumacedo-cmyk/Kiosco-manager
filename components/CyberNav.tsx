"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/productos", label: "Productos", icon: "📦" },
  { href: "/ventas/nueva", label: "Nueva Venta", icon: "🛒" },
  { href: "/reportes/hoy", label: "Reportes", icon: "📊" },
];

export default function CyberNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <nav className="bg-[var(--carbon-gray)] border-b border-[var(--slate-gray)] px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="text-3xl font-bold">
            <span className="neon-text-cyan">24</span>
            <span className="neon-text-magenta"> SIETE</span>
          </div>
          <div className="h-8 w-8 rounded-full neon-border-cyan animate-pulse-cyan" />
        </Link>

        {/* Navigation Links */}
        <div className="flex gap-2 items-center">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg
                  font-semibold text-sm uppercase tracking-wide
                  transition-all duration-300
                  ${
                    isActive
                      ? "neon-outline-cyan neon-text-cyan"
                      : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]"
                  }
                `}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Botón de Logout */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--error)] text-[var(--error)] font-semibold text-sm uppercase tracking-wide transition-all duration-300 hover:bg-[var(--error)] hover:text-[var(--dark-bg)]"
            title="Cerrar sesión"
          >
            <span className="text-lg">🔒</span>
            <span>{loggingOut ? "..." : "Salir"}</span>
          </button>
        </div>
      </div>
    </nav>
  );
}