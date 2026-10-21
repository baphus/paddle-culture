"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChapterLink {
  id: string;
  title: string;
}

export default function ManualContents({
  chapters,
}: {
  chapters: readonly ChapterLink[];
}) {
  const [activeId, setActiveId] = useState(chapters[0]?.id ?? "");
  const animationFrame = useRef<number | null>(null);

  const updateActive = useCallback(() => {
    if (animationFrame.current !== null) return;

    animationFrame.current = window.requestAnimationFrame(() => {
      const marker = Math.min(240, window.innerHeight * 0.3);
      let nextId = chapters[0]?.id ?? "";

      for (const chapter of chapters) {
        const section = document.getElementById(chapter.id);
        if (section && section.getBoundingClientRect().top <= marker) {
          nextId = chapter.id;
        }
      }

      const atPageBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atPageBottom && chapters.length > 0) {
        nextId = chapters[chapters.length - 1]!.id;
      }

      setActiveId((current) => (current === nextId ? current : nextId));
      animationFrame.current = null;
    });
  }, [chapters]);

  useEffect(() => {
    window.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    updateActive();

    return () => {
      window.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
    };
  }, [updateActive]);

  return (
    <aside className="h-fit rounded-lg border bg-card p-4 lg:sticky lg:top-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        On this page
      </h2>
      <nav aria-label="Manual contents" className="mt-3 space-y-1">
        {chapters.map((chapter) => {
          const active = activeId === chapter.id;
          return (
            <a
              key={chapter.id}
              href={`#${chapter.id}`}
              onClick={() => setActiveId(chapter.id)}
              aria-current={active ? "location" : undefined}
              className={`block rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {chapter.title}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
