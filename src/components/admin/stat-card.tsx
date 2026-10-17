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

/** KPI card shared by the dashboard and the revenue report. */
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
    <Card className="@container/card h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {trend != null ? (
          <CardAction>
            <Badge variant="outline">
              {up ? <TrendingUp /> : <TrendingDown />}
              {`${up ? "+" : ""}${trend.toFixed(1)}%`}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        {trend != null && trendLabel ? (
          <div className="line-clamp-1 flex gap-2 font-medium">
            {trendLabel}
            {up ? (
              <TrendingUp className="size-4" />
            ) : (
              <TrendingDown className="size-4" />
            )}
          </div>
        ) : null}
        <div className="text-muted-foreground">{subtitle}</div>
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
