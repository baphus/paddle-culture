import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `bookings.play_date` is added by drizzle/0004_play_date.sql. The app selects
// it, so if that migration has not been applied PostgREST fails the *whole*
// query with `column bookings.play_date does not exist` and /admin/bookings and
// /track/:token stop rendering (this happened in production). Both readers must
// therefore degrade to selecting the pre-migration columns and let the slots
// supply the Play Date, instead of surfacing a column-not-found error.

const root = join(import.meta.dirname, "..");
const admin = readFileSync(join(root, "src/lib/admin/bookings.ts"), "utf8");
const trackPage = readFileSync(join(root, "src/app/track/[token]/page.tsx"), "utf8");

test("missing play_date is detected narrowly, not as a blanket catch-all", () => {
  // Must key off the Postgres undefined_column code and the column name, so a
  // genuinely broken query (bad join, RLS, network) still surfaces.
  assert.match(admin, /function bookingsNeedsOptionalColumnsFallback/);
  assert.match(admin, /error\.code === "42703"/);
  assert.match(admin, /\/play_date\|refund_reason\/i\.test\(message\)/);
  assert.match(admin, /does not exist/);

  // Same narrow check in the tracking page.
  assert.match(trackPage, /bookingError\.code === "42703"/);
  assert.match(trackPage, /\/play_date\/i\.test\(bookingError\.message \?\? ""\)/);
});

test("listBookings retries without play_date instead of throwing", () => {
  assert.match(admin, /async function readPage\(page: number, withPlayDate: boolean\)/);
  assert.match(admin, /async function readPageWithFallback/);
  assert.match(admin, /if \(!bookingsNeedsOptionalColumnsFallback\([\s\S]{0,120}?\)\) throw error;/);
  assert.match(admin, /return readPage\(page, false\);/);
});

test("getBookingById retries without play_date instead of reporting 'not found'", () => {
  assert.match(admin, /async function readBooking\(withPlayDate: boolean\)/);
  assert.match(
    admin,
    /if \(bookingError && bookingsNeedsOptionalColumnsFallback\(bookingError\)\) \{\s*\(\{ data: booking, error: bookingError \} = await readBooking\(false\)\);/,
  );
});

test("the tracking page retries without play_date instead of notFound()", () => {
  assert.match(
    trackPage,
    /\(\{ data: bookingData, error: bookingError \} = \(await readBooking\(false\)\) as ReadResult\)/,
  );
  // The fallback must run BEFORE the notFound() guard, or the retry is dead code.
  const retryAt = trackPage.indexOf("readBooking(false)");
  const notFoundAt = trackPage.indexOf("if (bookingError || !bookingData) notFound();");
  assert.ok(retryAt > 0 && notFoundAt > 0 && retryAt < notFoundAt, "retry must precede notFound()");
});

test("a row without the column falls back to the slots, never to a UTC slice", () => {
  // play_date stays optional in the row types, and the Play Date still comes
  // from slotSelectionDateStr when it is absent.
  assert.match(admin, /function playDateOrNull\(row: object\): string \| null/);
  assert.match(admin, /playDateOrNull\(b\) \?\?/);
  assert.match(admin, /slotSelectionDateStr\(rawSlots\.map\(\(s\) => s\.slot_start\)\)/);
  assert.match(trackPage, /playDate=\{booking\.play_date \?\? null\}/);
  assert.doesNotMatch(admin, /slice\(0, 10\)/);
  assert.doesNotMatch(trackPage, /slice\(0, 10\)/);
});

test("the schema still declares play_date NOT NULL, so the migration stays the goal", () => {
  // The fallback is a safety net, not a reason to drop the column: the RPCs
  // write it and the readers prefer it.
  const schema = readFileSync(join(root, "src/db/schema.ts"), "utf8");
  assert.match(schema, /playDate: date\("play_date"\)\.notNull\(\)/);
});
