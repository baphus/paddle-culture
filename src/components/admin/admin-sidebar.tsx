"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2,
  BookOpen,
  CalendarDays,
  Clock,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/bookings", label: "Bookings", icon: BookOpen },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/revenue", label: "Revenue", icon: BarChart2 },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/users", label: "Users", icon: Users },
] as const;

const CONFIG_ITEMS = [
  { href: "/admin/courts", label: "Courts & Pricing", icon: Settings },
  { href: "/admin/hours", label: "Hours & Closures", icon: Clock },
] as const;

interface Props {
  email: string;
  name: string | null;
}

export default function AdminSidebar({ email, name }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  // Highlight flips on press; pathname takes over once navigation lands.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => setPendingHref(null), [pathname]);

  function isActive(href: string, exact?: boolean) {
    if (pendingHref) return pendingHref === href;
    return exact ? pathname === href : pathname.startsWith(href);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="CK Grounds"
              render={<Link href="/" aria-label="Back to CK Grounds site" />}
            >
              <Image
                src="/logo.jpg"
                alt="CK Grounds"
                width={32}
                height={32}
                className="size-8 rounded-full object-cover"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">CK Grounds</span>
                <span className="truncate text-xs text-muted-foreground">
                  Admin
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {NAV_ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
                const exact = "exact" in rest ? rest.exact : undefined;
                const active = isActive(href, exact);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      size="lg"
                      className="gap-3 px-3 data-active:bg-black! data-active:text-white! [&&_svg]:size-5! group-data-[collapsible=icon]:[&&_svg]:size-4!"
                      render={<Link href={href} />}
                      onClick={() => setPendingHref(href)}
                      isActive={active}
                      tooltip={label}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Config</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {CONFIG_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      size="lg"
                      className="gap-3 px-3 data-active:bg-black! data-active:text-white! [&&_svg]:size-5! group-data-[collapsible=icon]:[&&_svg]:size-4!"
                      render={<Link href={href} />}
                      onClick={() => setPendingHref(href)}
                      isActive={active}
                      tooltip={label}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-medium text-sidebar-primary-foreground">
            {(name ?? email).charAt(0).toUpperCase()}
          </span>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            {name ? <span className="truncate font-medium">{name}</span> : null}
            <span className="truncate text-xs text-muted-foreground">
              {email}
            </span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Sign out">
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
