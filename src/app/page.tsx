import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { courts } from "@/db/schema";
import BookingFlow from "@/components/booking/booking-flow";
import { FALLBACK_COURTS, type CourtOption } from "@/lib/courts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book a Court — Paddle Culture",
  description:
    "Pick a date, court, and consecutive hours, hold your slots, and submit with payment proof.",
};

// Public booking page (no auth). Courts are server-rendered from the live
// `courts` table; the flow refreshes them client-side via GET /api/courts and
// falls back to FALLBACK_COURTS when the DB is unreachable (incl. build).
async function loadCourts(): Promise<CourtOption[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({ id: courts.id, name: courts.name })
      .from(courts)
      .where(eq(courts.status, "active"))
      .orderBy(asc(courts.name));
    return rows;
  } catch {
    return FALLBACK_COURTS;
  }
}

export default async function Home() {
  const initialCourts = await loadCourts();
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Paddle Culture</h1>
        <p className="text-sm text-muted-foreground">
          Book a court in 3 steps: pick consecutive hours → your details → pay + upload proof.
          Same-day booking allowed for future slots.
        </p>
      </header>
      <BookingFlow initialCourts={initialCourts} />
    </main>
  );
}
