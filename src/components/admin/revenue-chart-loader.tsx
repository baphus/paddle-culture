"use client";

import dynamic from "next/dynamic";
import type { RevenueDay } from "@/lib/admin/bookings";
import { LoadingAnimation } from "@/components/ui/loading-animation";

// ADR-10: recharts stays admin-only and client-rendered — this wrapper owns
// the ssr:false boundary (not allowed directly in a Server Component) so the
// chart code never enters the public/server bundle.
const Chart = dynamic(() => import("./revenue-chart"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-56 items-center justify-center">
      <LoadingAnimation label="Loading revenue chart" />
    </div>
  ),
});

export default function RevenueChartLoader({ days }: { days: RevenueDay[] }) {
  return <Chart days={days} />;
}
