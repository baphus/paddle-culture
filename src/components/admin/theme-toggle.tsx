"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // next-themes resolves the theme from localStorage during hydration, so a
  // label derived from `resolvedTheme` would differ from the server render.
  // Render a neutral label until mounted, then swap to the real one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  function toggle() {
    // Read the live DOM class so the very first click after hydration
    // works even before `resolvedTheme` has been used for a label.
    const dark = document.documentElement.classList.contains("dark");
    const nextTheme = dark ? "light" : "dark";

    // Read the icon's center in viewport coordinates for the wipe origin.
    const btn = buttonRef.current;
    const rect = btn?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : 0;

    // Use the View Transitions API when available: it captures a before/after
    // snapshot of the page and we reveal the new one with a circular wipe
    // from the icon. Falls back to an instant flip on unsupported browsers.
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => {
        finished: Promise<void>;
      };
    };

    const flip = () => setTheme(nextTheme);

    if (!doc.startViewTransition) {
      flip();
      return;
    }

    // Pass the icon center to CSS via custom properties on :root so the
    // view-transition pseudo-elements can clip from that origin.
    document.documentElement.style.setProperty("--wipe-x", `${x}px`);
    document.documentElement.style.setProperty("--wipe-y", `${y}px`);
    doc.startViewTransition(flip);
  }

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={
        mounted
          ? isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
          : "Toggle theme"
      }
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : "Toggle theme"}
    >
      {/* Both icons are always rendered; CSS picks one so hydration can never
          mismatch on the resolved theme. */}
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
