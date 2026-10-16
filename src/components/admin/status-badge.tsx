import {
  CheckCircle2,
  Clock,
  Info,
  KeyRound,
  Pencil,
  UserCheck,
  UserX,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BOOKING_STATUSES } from "@/lib/admin/bookings";

type Style = { icon: LucideIcon; className: string };

type StatusKey = (typeof BOOKING_STATUSES)[number];

// Stock Tailwind palette (not repo brand tokens): a tinted outline badge per status.
const BOOKING_STATUS_STYLES: Record<StatusKey, Style> = {
  Pending: {
    icon: Clock,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  Approved: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  Rejected: {
    icon: XCircle,
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
};

const UNKNOWN_STATUS: Style = {
  icon: Info,
  className: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

// Stock Tailwind palette (not repo brand tokens): one tinted outline badge per verb group.
const EMERALD: Style = {
  icon: CheckCircle2,
  className: "border-emerald-200 bg-emerald-50 text-emerald-800",
};
const ROSE: Style = {
  icon: XCircle,
  className: "border-rose-200 bg-rose-50 text-rose-800",
};
const SKY: Style = {
  icon: Pencil,
  className: "border-sky-200 bg-sky-50 text-sky-800",
};
const VIOLET: Style = {
  icon: KeyRound,
  className: "border-violet-200 bg-violet-50 text-violet-800",
};

// Group by verb (last dotted segment); the server matches actions as free text,
// so anything unexpected lands on the neutral style.
function auditActionStyle(action: string): Style {
  if (action.startsWith("admin_invite")) return VIOLET;
  const verb = action.slice(action.lastIndexOf(".") + 1);
  if (verb === "approve" || verb === "create") return EMERALD;
  if (verb === "reject" || verb === "delete") return ROSE;
  if (verb === "update" || verb === "status") return SKY;
  return UNKNOWN_STATUS;
}

export function BookingStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { icon: Icon, className: tint } =
    BOOKING_STATUS_STYLES[status as StatusKey] ?? UNKNOWN_STATUS;
  return (
    <Badge variant="outline" className={cn(tint, className)}>
      <Icon />
      {status}
    </Badge>
  );
}

export function AuditActionBadge({ action }: { action: string }) {
  const { icon: Icon, className } = auditActionStyle(action);
  return (
    <Badge variant="outline" className={className}>
      <Icon />
      {action}
    </Badge>
  );
}

export function UserStatusBadge({ status }: { status: string }) {
  const active = status === "active";
  const Icon = active ? UserCheck : UserX;
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-zinc-200 bg-zinc-50 text-zinc-700"
      }
    >
      <Icon />
      {active ? "Active" : "Deactivated"}
    </Badge>
  );
}

export function CourtStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "default" : "secondary"}>
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  );
}
