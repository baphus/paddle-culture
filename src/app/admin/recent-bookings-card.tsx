"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ViewToggle } from "@/components/ui/view-toggle";
import { useIsMobileQuery } from "@/hooks/use-mobile";

const ViewContext = React.createContext<"list" | "grid">("list");

/** Read by the table below; the toggle in this header owns the state. */
export function useBookingView() {
  return React.useContext(ViewContext);
}

export default function RecentBookingsCard({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobileQuery();
  const [view, setView] = React.useState<"list" | "grid">(isMobile ? "grid" : "list");

  // Mobile default is the grid; the header toggle still wins after mount.
  React.useEffect(() => {
    setView(isMobile ? "grid" : "list");
  }, [isMobile]);

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
