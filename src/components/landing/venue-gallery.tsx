"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Bookmark, Send } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    src: "/images/venue/net.jpg",
    alt: "CK Grounds — pickleball net",
    caption: "Regulation-height nets. No excuses on the setup. 🎯",
  },
  {
    src: "/images/venue/heroo.jpg",
    alt: "CK Grounds — venue entrance",
    caption: "Welcome to CK Grounds — your home court in Tabuelan, Cebu. 🏓",
  },
  {
    src: "/images/venue/94a3d3c0-3615-4ef2-afd8-a42832f90ee3.jpg",
    alt: "CK Grounds — facility view",
    caption: "Clean facilities, premium nets, and dedicated parking. 🚗",
  },
  {
    src: "/images/venue/another pic.jpg",
    alt: "CK Grounds — players on court",
    caption: "Community, competition, and good vibes only. Book your slot today. 🔥",
  },
  {
    src: "/images/venue/IMG_8241.JPG",
    alt: "CK Grounds — court area",
    caption: "Two full-size courts ready to go. Pick your time, pick your side. ✅",
  },
  {
    src: "/images/venue/IMG_8245.JPG",
    alt: "CK Grounds — covered courts",
    caption: "Covered and protected — play through any weather. ☀️🌧️",
  },
  {
    src: "/images/venue/IMG_8248.JPG",
    alt: "CK Grounds — night lights",
    caption: "Night games hit different under full court lighting. 🌙",
  },
];

// Static "likes" per slide — decorative, not interactive state
const LIKES = [214, 189, 301, 412, 178, 256, 333];

export default function VenueGallery() {
  const [current, setCurrent] = useState(0);
  const [liked, setLiked] = useState<boolean[]>(Array(SLIDES.length).fill(false));
  const [saved, setSaved] = useState<boolean[]>(Array(SLIDES.length).fill(false));
  const [transitioning, setTransitioning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback(
    (next: number) => {
      if (transitioning || next === current) return;
      setTransitioning(true);
      setTimeout(() => {
        setCurrent(next);
        setTransitioning(false);
      }, 220);
    },
    [current, transitioning],
  );

  const prev = useCallback(() => {
    go((current - 1 + SLIDES.length) % SLIDES.length);
  }, [current, go]);

  const next = useCallback(() => {
    go((current + 1) % SLIDES.length);
  }, [current, go]);

  useEffect(() => {
    timeoutRef.current = setTimeout(next, 5000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [current, next]);

  const toggleLike = () =>
    setLiked((prev) => prev.map((v, i) => (i === current ? !v : v)));

  const toggleSave = () =>
    setSaved((prev) => prev.map((v, i) => (i === current ? !v : v)));

  const likeCount = LIKES[current] + (liked[current] ? 1 : 0);

  return (
    <section id="gallery" className="scroll-mt-20" aria-labelledby="gallery-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">

        {/* Section header */}
        <div className="mb-8 text-center">
          <h2
            id="gallery-heading"
            className="text-3xl font-black tracking-tight text-ink sm:text-4xl"
          >
            See the Grounds
          </h2>
        </div>

        {/* Post card — capped at Instagram post width */}
        <div className="mx-auto max-w-[400px]">
          <article
            className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_4px_28px_rgba(60,56,53,0.09)]"
            aria-label="CK Grounds photo post"
          >

            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="relative size-9 shrink-0 overflow-hidden rounded-full border border-line">
                <Image
                  src="/logo.jpg"
                  alt="CK Grounds"
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold leading-none text-ink">ck_grounds</p>
                <p className="mt-0.5 text-[11px] leading-none text-ink/50">Tabuelan, Cebu</p>
              </div>
              <span className="text-[11px] font-semibold text-ink/40">
                {current + 1}/{SLIDES.length}
              </span>
            </div>

            {/* ── Photo carousel — 3:4 ── */}
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-pine">
              {SLIDES.map((slide, i) => (
                <div
                  key={slide.src}
                  className={cn(
                    "absolute inset-0 transition-opacity duration-200",
                    i === current ? "opacity-100 z-10" : "opacity-0 z-0",
                    transitioning && i === current ? "opacity-0" : "",
                  )}
                  aria-hidden={i !== current}
                >
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    sizes="400px"
                    className="object-cover"
                    priority={i === 0}
                  />
                </div>
              ))}

              {/* Ghost nav arrows */}
              <button
                onClick={prev}
                aria-label="Previous photo"
                className="absolute top-1/2 left-2.5 z-20 -translate-y-1/2 grid size-7 place-items-center rounded-full bg-black/20 text-white backdrop-blur-[2px] transition hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-white"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
              </button>
              <button
                onClick={next}
                aria-label="Next photo"
                className="absolute top-1/2 right-2.5 z-20 -translate-y-1/2 grid size-7 place-items-center rounded-full bg-black/20 text-white backdrop-blur-[2px] transition hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-white"
              >
                <ChevronRight className="size-3.5" aria-hidden />
              </button>

              {/* Slide dots */}
              <div
                className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5"
                role="tablist"
                aria-label="Gallery slides"
              >
                {SLIDES.map((slide, i) => (
                  <button
                    key={slide.src}
                    role="tab"
                    aria-selected={i === current}
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => go(i)}
                    className={cn(
                      "rounded-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-white",
                      i === current
                        ? "w-4 h-1.5 bg-white"
                        : "size-1.5 bg-white/40 hover:bg-white/70",
                    )}
                  />
                ))}
              </div>
            </div>

            {/* ── Action bar ── */}
            <div className="flex items-center px-3.5 pt-3 pb-1">
              {/* Left: like + comment + share */}
              <div className="flex items-center gap-3.5">
                <button
                  onClick={toggleLike}
                  aria-label={liked[current] ? "Unlike" : "Like"}
                  aria-pressed={liked[current]}
                  className="group flex items-center transition focus-visible:outline-none"
                >
                  <Heart
                    className={cn(
                      "size-6 transition-all duration-150",
                      liked[current]
                        ? "fill-flame stroke-flame scale-110"
                        : "stroke-ink/70 group-hover:stroke-flame",
                    )}
                    aria-hidden
                  />
                </button>
                <button
                  aria-label="Comment"
                  className="group flex items-center transition focus-visible:outline-none"
                >
                  <MessageCircle
                    className="size-6 stroke-ink/70 transition group-hover:stroke-ink"
                    aria-hidden
                  />
                </button>
                <button
                  aria-label="Share"
                  className="group flex items-center transition focus-visible:outline-none"
                >
                  <Send
                    className="size-5 stroke-ink/70 transition group-hover:stroke-ink"
                    aria-hidden
                  />
                </button>
              </div>
              {/* Right: save */}
              <button
                onClick={toggleSave}
                aria-label={saved[current] ? "Unsave" : "Save"}
                aria-pressed={saved[current]}
                className="group ml-auto flex items-center transition focus-visible:outline-none"
              >
                <Bookmark
                  className={cn(
                    "size-5.5 transition-all duration-150",
                    saved[current]
                      ? "fill-ink stroke-ink"
                      : "stroke-ink/70 group-hover:stroke-ink",
                  )}
                  aria-hidden
                />
              </button>
            </div>

            {/* ── Like count ── */}
            <div className="px-3.5 pb-1">
              <p className="text-[13px] font-bold text-ink">
                {likeCount.toLocaleString()} likes
              </p>
            </div>

            {/* ── Caption ── */}
            <div className="px-3.5 pb-4">
              <p className="text-[13px] leading-5 text-ink">
                <span className="font-extrabold">ck_grounds</span>{" "}
                <span className="text-ink/80">{SLIDES[current].caption}</span>
              </p>
              <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink/40">
                Book at ckgrounds.vercel.app
              </p>
            </div>

          </article>
        </div>

      </div>
    </section>
  );
}
