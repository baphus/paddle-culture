"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import AdminSidebar from "./admin-sidebar";

interface Props {
  email: string;
  name: string | null;
  children: React.ReactNode;
}

export default function AdminShell({ email, name, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-svh bg-cream">
      {/* Desktop sidebar — fixed left column */}
      <aside className="hidden w-56 shrink-0 border-r border-line bg-parchment lg:flex lg:flex-col">
        <div className="sticky top-0 h-svh overflow-hidden">
          <AdminSidebar email={email} name={name} />
        </div>
      </aside>

      {/* Mobile sidebar sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-56 border-r border-line bg-parchment p-0"
          aria-label="Admin navigation"
        >
          <AdminSidebar email={email} name={name} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar */}
        <header className="flex h-14 items-center gap-3 border-b border-line bg-parchment px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-xl border border-line bg-white text-ink transition-colors hover:bg-oat"
          >
            <Menu className="size-4" aria-hidden />
          </button>
          <span className="text-sm font-extrabold tracking-tight text-ink">
            CK Grounds Admin
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
