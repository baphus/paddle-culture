import { cn } from "@/lib/utils";

type LoadingAnimationProps = {
  label?: string;
  size?: "compact" | "default" | "large";
  className?: string;
};

const sizes = {
  compact: "size-5",
  default: "size-16 sm:size-20",
  large: "size-24 sm:size-28",
};

/** A consistent, branded progress cue for route and in-place loading states. */
export function LoadingAnimation({
  label = "Loading",
  size = "default",
  className,
}: LoadingAnimationProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center justify-center", className)}
    >
      {/* The supplied SVG owns the motion. Hide it for reduced-motion users while
          retaining an accessible status announcement. */}
      <img
        src="/pickleball-loader.svg"
        alt=""
        aria-hidden="true"
        className={cn("object-contain motion-reduce:hidden", sizes[size])}
      />
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="hidden size-3 rounded-full bg-flame motion-reduce:inline-block"
      />
    </span>
  );
}
