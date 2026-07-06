"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ListOrdered,
  Menu,
  NotebookPen,
  BookOpenCheck,
  ChartNoAxesCombined,
  FileUp,
  LogOut,
  Settings,
  X,
} from "lucide-react";
import { signOutAction } from "@/server/auth-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, index: "01" },
  { href: "/trades", label: "Trades", icon: ListOrdered, index: "02" },
  { href: "/playbook", label: "Playbook", icon: BookOpenCheck, index: "03" },
  { href: "/journal", label: "Journal", icon: NotebookPen, index: "04" },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined, index: "05" },
  { href: "/import", label: "Import", icon: FileUp, index: "06" },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  index,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Settings;
  index: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-all duration-200",
        active
          ? "border-text-primary/70 text-accent font-semibold"
          : "border-transparent text-text-muted hover:text-text-primary hover:bg-ink-hover",
      )}
    >
      <span
        className={cn(
          "h-1 w-1 rounded-full transition-colors",
          active ? "bg-accent" : "bg-ink-line-bright",
        )}
        aria-hidden
      />
      <Icon size={15} strokeWidth={2} aria-hidden />
      <span className="flex-1">{label}</span>
      <span className="num text-[10px] text-text-faint">{index}</span>
    </Link>
  );
}

export function Sidebar({
  balance,
  mtdPct,
  userLabel,
}: {
  balance: number;
  mtdPct: number | null;
  userLabel: string;
}) {
  const pathname = usePathname();
  // The drawer is tied to the route it was opened on, so navigating
  // anywhere closes it without needing an effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (next: boolean) => setOpenPath(next ? pathname : null);

  return (
    <>
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-ink-line bg-ink-raised px-4 lg:hidden">
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-soft to-accent-fill text-sm font-bold text-accent-ink"
            aria-hidden
          >
            L
          </span>
          <span className="font-bold tracking-wide">LEDGER</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-line text-text-muted"
        >
          {open ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
        </button>
      </header>

      {/* Backdrop (mobile, drawer open) */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 border-r border-ink-line bg-ink-raised flex flex-col overflow-y-auto transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:transition-none",
        )}
      >
      <div className="px-4 py-5 flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-soft to-accent-fill font-bold text-accent-ink shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]"
          aria-hidden
        >
          L
        </span>
        <Link href="/" className="block leading-tight">
          <span className="block font-bold tracking-wide text-text-primary">
            LEDGER
          </span>
          <span className="num block text-[10px] tracking-[0.18em] text-text-faint">
            V1.0 · TERMINAL
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ href, label, icon, index }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            index={index}
            active={href === "/" ? pathname === "/" : pathname.startsWith(href)}
          />
        ))}
      </nav>

      <div className="px-3 pb-3">
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          index="07"
          active={pathname.startsWith("/settings")}
        />
      </div>

      <div className="px-3 pb-4 space-y-2">
        <div className="card-tile px-4 py-3">
          <p className="eyebrow mb-1.5">Account balance</p>
          <p className="num text-lg font-semibold">{formatMoney(balance)}</p>
          {mtdPct != null && (
            <p
              className={cn(
                "num mt-0.5 flex items-center gap-1.5 text-xs",
                mtdPct >= 0 ? "text-profit" : "text-loss",
              )}
            >
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  mtdPct >= 0 ? "bg-profit" : "bg-loss",
                )}
                aria-hidden
              />
              {mtdPct >= 0 ? "+" : ""}
              {mtdPct.toFixed(1)}% MTD
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-1">
          <span
            className="num min-w-0 truncate text-[11px] text-text-faint"
            title={userLabel}
          >
            {userLabel}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out"
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-loss transition-colors"
            >
              <LogOut size={11} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </div>
      </aside>
    </>
  );
}
