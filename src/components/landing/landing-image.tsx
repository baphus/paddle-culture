"use client";

import { useState } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  label?: string;
};

/**
 * Brand image with a warm gradient fallback.
 * If /public/images/<file> is missing, the gradient + icon still looks intentional.
 * Drop-in list: public/images/hero.jpg, public/images/court-1.jpg, public/images/court-2.jpg
 */
export default function LandingImage({ src, alt, priority, className, imgClassName, label }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-gradient-to-br from-pine via-pine-high to-cocoa",
        className,
      )}
      role="img"
      aria-label={alt}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(234,102,44,0.45),transparent_55%),radial-gradient(circle_at_85%_80%,rgba(210,232,255,0.25),transparent_50%)]" aria-hidden />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-pine-ink/80">
        <ImagePlus className="size-8 opacity-70" aria-hidden />
        {label ? <p className="text-xs font-bold tracking-widest uppercase opacity-70">{label}</p> : null}
      </div>
      {!failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, 50vw"
          className={cn("object-cover", imgClassName)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
