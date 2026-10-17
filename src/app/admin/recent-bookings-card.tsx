"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ViewToggle } from "@/components/ui/view-toggle";

const ViewContext = React.createContext<"list" | "grid">("list");

/** Read by the table below; the toggle in this header owns the state. */
export function useBookingView() {
  return React.useContext(ViewContext);
}

export default function RecentBookingsCard({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<"list" | "grid">("list");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Recent bookings</CardTitle>
        <CardAction className="flex items-center gap-3">
          <Link href="/admin/bookings" className="text-sm text-muted-foreground hover:text-foreground">
            View all
          </Link>
          <ViewToggle view={view} onViewChange={setView} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ViewContext.Provider value={view}>{children}</ViewContext.Provider>
      </CardContent>
    </Card>
  );
}
