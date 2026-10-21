import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center bg-cream px-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-pine/60">
        Fault
      </p>
      <h1 className="mt-2 text-6xl font-extrabold text-ink">404</h1>
      <p className="mt-2 max-w-md text-sm text-ink/70">
        This page doesn&apos;t exist or has been moved. Head back to the courts
        to make or track a booking.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-pine px-6 py-3 text-sm font-bold text-cream transition-colors hover:bg-pine/90"
      >
        Back to booking
      </Link>
    </main>
  );
}
