import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function Loading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-cream px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <LoadingAnimation size="large" label="Loading page" />
        <p className="text-sm font-bold text-pine">Getting the court ready…</p>
      </div>
    </main>
  );
}
