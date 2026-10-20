import { Skeleton } from "@/components/ui/skeleton";
import { STAT_CARD_GRID, STAT_CARD_MIN_HEIGHT } from "@/components/admin/stat-card";

export default function FinanceLoading() {
  return <div className="space-y-5" aria-label="Loading Finance dashboard" aria-busy="true">
    <div className="flex justify-between gap-4"><div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-72" /></div><Skeleton className="h-9 w-56" /></div>
    <div className={STAT_CARD_GRID}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className={`${STAT_CARD_MIN_HEIGHT} rounded-xl`} />)}</div>
    <Skeleton className="h-96 rounded-xl" />
    <Skeleton className="h-72 rounded-xl" />
  </div>;
}
