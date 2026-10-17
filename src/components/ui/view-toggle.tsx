"use client"

import { LayoutGridIcon, ListIcon } from "lucide-react"

import { cn } from "cn"
import { Button } from "@/components/ui/button"

/** List/grid segmented switch. The thumb is inset by the container padding. */
export function ViewToggle({
  view,
  onViewChange,
}: {
  view: "list" | "grid"
  onViewChange: (view: "list" | "grid") => void
}) {
  return (
    <div className="relative flex h-9 items-center rounded-full bg-muted p-1">
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-1 size-7 rounded-full bg-background shadow-sm transition-transform",
          view === "grid" && "translate-x-7"
        )}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="List view"
        aria-pressed={view === "list"}
        onClick={() => onViewChange("list")}
        className={cn(
          "relative z-10 size-7 rounded-full hover:bg-transparent",
          view === "list" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <ListIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Grid view"
        aria-pressed={view === "grid"}
        onClick={() => onViewChange("grid")}
        className={cn(
          "relative z-10 size-7 rounded-full hover:bg-transparent",
          view === "grid" ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <LayoutGridIcon />
      </Button>
    </div>
  )
}
