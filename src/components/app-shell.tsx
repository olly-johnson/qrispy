import Link from "next/link";
import { Activity, BarChart3, BriefcaseBusiness, ListChecks, Settings, WalletCards } from "lucide-react";

import type { AppUser } from "@/lib/auth/session";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: WalletCards },
  { href: "/trades", label: "Trades", icon: BarChart3 },
  { href: "/positions", label: "Positions", icon: BriefcaseBusiness },
  { href: "/market-breadth", label: "Breadth", icon: Activity },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07090d] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-[#0b0f14] px-5 py-6 lg:block">
        <Link href="/dashboard" className="block">
          <div className="text-lg font-semibold tracking-[0.2em] text-emerald-300">
            QRISPY
          </div>
          <div className="mt-1 text-xs text-zinc-500">{user.email ?? "Owner account"}</div>
        </Link>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Icon className="h-4 w-4 text-cyan-300" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-[#07090d]/90 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="font-semibold tracking-[0.18em] text-emerald-300 lg:hidden">
              QRISPY
            </Link>
            <nav className="flex gap-1 overflow-x-auto lg:hidden">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.08]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
