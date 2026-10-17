import type { ComponentType } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface StatCardProps {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  subtitle: string;
  /** Makes the whole card a link when set. */
  href?: string;
  /** % change vs a prior period; omit to hide the badge. */
  trend?: number | null;
  trendLabel?: string;
}

/** Shared by the KPI grid and its Suspense skeleton so the two have equal height. */
export const STAT_CARD_GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
export const STAT_CARD_MIN_HEIGHT = "min-h-[168px]";

/**
 * KPI card shared by the dashboard and the revenue report.
 *
 * Every card renders the same rows — label + badge, value, one-line footer —
 * so heights and styling stay identical across the grid. The badge slot is
 * always present (empty without a trend) to keep the header grid aligned, and
 * the card stretches to the row height so a shorter label can't shrink it.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
  href,
  trend,
  trendLabel,
}: StatCardProps) {
  const up = trend != null && trend >= 0;

  const card = (
    <Card
      data-slot="stat-card"
      className={`@container/card h-full ${STAT_CARD_MIN_HEIGHT}`}
    >
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <CardDescription className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          {label}
        </CardDescription>
        <CardAction className="self-center">
          {trend != null ? (
            <Badge variant="outline">
              {up ? <TrendingUp /> : <TrendingDown />}
              {`${up ? "+" : ""}${trend.toFixed(1)}%`}
            </Badge>
          ) : null}
        </CardAction>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
      </CardHeader>
      {/* mt-auto pins the footer to the card bottom, so the bordered muted
          strip hugs the bottom edge instead of floating mid-card. */}
      <CardFooter className="mt-auto flex-col items-start gap-1.5">
        <div className="line-clamp-1 text-sm font-medium">
          {trend != null && trendLabel ? trendLabel : subtitle}
        </div>
        <div className="line-clamp-1 text-xs text-muted-foreground">
          {trend != null && trendLabel ? subtitle : "\u00A0"}
        </div>
      </CardFooter>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      {card}
    </Link>
  );
}
