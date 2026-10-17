"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NextTopLoader from "nextjs-toploader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminSidebar from "./admin-sidebar";
import ThemeToggle from "./theme-toggle";

interface Props {
  email: string;
  name: string | null;
  children: React.ReactNode;
}

export default function AdminShell({ email, name, children }: Props) {
  const pathname = usePathname();
  const section = pathname.split("/")[2];
  const label = section
    ? section.charAt(0).toUpperCase() + section.slice(1)
    : "Dashboard";

  return (
    <TooltipProvider>
      <NextTopLoader color="var(--primary)" showSpinner={false} />
      <SidebarProvider>
        <div data-admin-shell className="contents">
          <AdminSidebar email={email} name={name} />
          <SidebarInset className="min-w-0 overflow-x-clip">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex w-full items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mr-2 data-[orientation=vertical]:h-4"
                />
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink render={<Link href="/admin" />}>
                        Admin
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {section ? (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{label}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    ) : null}
                  </BreadcrumbList>
                </Breadcrumb>
                <div className="ml-auto">
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-x-clip p-4 pt-4 md:p-6 md:pt-6">
              {children}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}