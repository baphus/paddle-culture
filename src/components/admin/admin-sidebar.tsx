"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart2,
  BookOpen,
  CalendarDays,
  Clock,
  DollarSign,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/bookings", label: "Bookings", icon: BookOpen },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/revenue", label: "Revenue", icon: BarChart2 },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/users", label: "Users", icon: Users },
] as const;

const CONFIG_ITEMS = [
  { href: "/admin/courts", label: "Courts", icon: Settings },
  { href: "/admin/pricing", label: "Pricing", icon: DollarSign },
  { href: "/admin/hours", label: "Hours & Closures", icon: Clock },
] as const;

interface Props {
  email: string;
  name: string | null;
  onNavigate?: () => void;
}

export default function AdminSidebar({ email, name, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <Link href="/" aria-label="Back to CK Grounds site">
          <Image
            src="/logo.jpg"
            alt="CK Grounds"
            width={34}
            height={34}
            className="size-[34px] rounded-full object-cover"
          />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-extrabold tracking-tight text-ink">
            CK Grounds
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-warm-muted">
            Admin
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        <div className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
          const exact = "exact" in rest ? rest.exact : undefined;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive(href, exact)
                  ? "bg-flame/10 text-flame"
                  : "text-ink/70 hover:bg-oat hover:text-ink",
              )}
              aria-current={isActive(href, exact) ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isActive(href, exact) ? "text-flame" : "text-ink/50",
                )}
                aria-hidden
              />
              {label}
            </Link>
          );
        })}
        </div>

        <div className="mt-5">
          <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-warm-muted">
            Config
          </p>
          <div className="space-y-0.5">
            {CONFIG_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  isActive(href)
                    ? "bg-flame/10 text-flame"
                    : "text-ink/70 hover:bg-oat hover:text-ink",
                )}
                aria-current={isActive(href) ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive(href) ? "text-flame" : "text-ink/50",
                  )}
                  aria-hidden
                />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t border-line px-3 py-3">
        <div className="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pine/10 text-[11px] font-bold text-pine">
            {(name ?? email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {name ? (
              <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
            ) : null}
            <p className="truncate text-[11px] text-warm-muted">{email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink/60 transition-colors hover:bg-oat hover:text-ink"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  );
}
