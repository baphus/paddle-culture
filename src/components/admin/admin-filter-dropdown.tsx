"use client";

import React, { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Re-exported so callers can import both from the same path
export { Input, Label };

// One `mousedown` listener shared by every open dropdown, so N panels don't
// stack N document listeners.
const outsideHandlers = new Set<(e: MouseEvent) => void>();
function onDocumentMouseDown(e: MouseEvent) {
  for (const handler of outsideHandlers) handler(e);
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface AdminFilterDropdownProps {
  /** Trigger button label. Defaults to "Filters". */
  label?: string;
  /** Badge count; displayed as a coloured pill when > 0. */
  count?: number;
  /**
   * Pre-populated values keyed by input `name`.
   * Used to set `defaultValue` on inputs rendered by `children`.
   * The component itself does not inject these into the DOM —
   * the parent is responsible for passing matching `defaultValue`
   * props to the child inputs.
   */
  defaultValues?: Record<string, string>;
  /** Called with serialised form values when "Apply" is pressed. */
  onApply: (values: Record<string, string>) => void;
  /** Called when "Reset" is pressed. */
  onReset: () => void;
  /** Filter group content rendered inside the panel. */
  children: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────

export function AdminFilterDropdown({
  label = "Filters",
  count = 0,
  defaultValues: _defaultValues = {},
  onApply,
  onReset,
  children,
}: AdminFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Close helpers ───────────────────────────────────────────────────────

  function closePanel() {
    setOpen(false);
    setValidationError(null);
  }

  // ── Keyboard: Escape closes panel ──────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePanel();
      }
    }

    const panel = panelRef.current;
    panel?.addEventListener("keydown", onKeyDown);
    return () => panel?.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // ── Click-outside: close panel ─────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closePanel();
      }
    }

    outsideHandlers.add(onMouseDown);
    if (outsideHandlers.size === 1) {
      document.addEventListener("mousedown", onDocumentMouseDown);
    }
    return () => {
      outsideHandlers.delete(onMouseDown);
      if (outsideHandlers.size === 0) {
        document.removeEventListener("mousedown", onDocumentMouseDown);
      }
    };
  }, [open]);

  // ── Apply ───────────────────────────────────────────────────────────────

  function handleApply() {
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    const values: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        values[key] = value;
      }
    }

    const from = values["from"] ?? "";
    const to = values["to"] ?? "";

    if (from && to && from > to) {
      setValidationError("From date must be on or before To date");
      return;
    }

    setValidationError(null);
    onApply(values);
    setOpen(false);
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  function handleReset() {
    onReset();
    setOpen(false);
    setValidationError(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen((prev) => !prev);
          setValidationError(null);
        }}
        className="h-9 rounded-full"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="size-4" />
        {label}
        {count > 0 && (
          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {count}
          </span>
        )}
      </Button>

      {/* Floating panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} panel`}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 50,
            minWidth: 280,
          }}
          className="mt-1.5 rounded-xl border bg-popover text-popover-foreground shadow-md"
        >
          {/* Focus-trap sentinel — top */}
          <span tabIndex={0} aria-hidden="true" className="sr-only" />

          <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-4 p-4">
              {children}
            </div>

            {/* Validation error */}
            {validationError && (
              <p
                role="alert"
                className="mx-4 -mt-1 text-xs font-medium text-destructive"
              >
                {validationError}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                Reset
              </Button>
              <Button type="button" size="sm" onClick={handleApply}>
                Apply
              </Button>
            </div>
          </form>

          {/* Focus-trap sentinel — bottom */}
          <span tabIndex={0} aria-hidden="true" className="sr-only" />
        </div>
      )}
    </div>
  );
}

// ── FilterGroupSection ─────────────────────────────────────────────────────

export function FilterGroupSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}
