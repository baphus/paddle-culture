"use client";

import React, { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Re-exported so callers can import both from the same path
export { Input, Label };

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

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
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
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setValidationError(null);
        }}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all",
          open
            ? "bg-flame text-white border-flame"
            : "bg-white text-ink/70 border-line hover:border-ink/30 hover:bg-oat/60",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="size-3.5" />
        {label}
        {count > 0 && (
          <span
            className={cn(
              "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
              open ? "bg-white/25 text-white" : "bg-flame text-white",
            )}
          >
            {count}
          </span>
        )}
      </button>

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
          className="mt-1.5 rounded-xl border border-line bg-white shadow-lg"
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
                className="mx-4 -mt-1 text-xs font-medium text-error"
              >
                {validationError}
              </p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-7 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink/70 transition-colors hover:bg-oat/60"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="inline-flex h-7 items-center rounded-lg bg-flame px-3 text-xs font-semibold text-white transition-colors hover:bg-flame-hover"
              >
                Apply
              </button>
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
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
        {title}
      </p>
      {children}
    </div>
  );
}
