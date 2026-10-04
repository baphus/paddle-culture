import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode; // right-side actions
}

export default function PageHeader({ title, description, className, children }: Props) {
  return (
    <div className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-warm-muted">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
