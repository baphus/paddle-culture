"use client";

import type { CourtSlotGroup } from "@/lib/courts";
import type { DetailsValues } from "@/components/booking/details-form";
import type { HoldState } from "@/components/booking/step1-date-time";

/**
 * Booking draft persistence.
 *
 * Every bit of wizard state used to live only in React memory, so a mobile
 * browser dropping the page — the classic case is leaving for a banking app
 * and coming back to a reload — reset the customer to step 1 with nothing
 * saved, while their money was already on its way and their slots sat held.
 *
 * Session storage keeps reload recovery; a short-lived local copy also
 * survives tab closure. Both carry the hold owner token. Expiry is checked
 * on read; it never extends the server's hold or reclaim deadline.
 *
 * Nothing here is trusted: the server re-validates the hold, the slots and the
 * prices on every read and write. This is purely so the customer does not have
 * to retype their details after the browser threw them away.
 */

const DRAFT_KEY = "pc.booking.draft.v1";
const RECOVERY_KEY = `${DRAFT_KEY}.recovery`;
const DRAFT_TTL_MS = 40 * 60 * 1000;

export type DraftStep = "select" | "details" | "review" | "payment";

export interface BookingDraft {
  /** Bumped whenever the shape changes; older drafts are discarded. */
  v: 1;
  /** Browser-session capability that ties the draft to its holds. */
  ownerToken: string;
  step: DraftStep;
  hold: HoldState | null;
  selectedDate: string | null;
  /**
   * Courts the booking actually touches — what the summary names and what the
   * restored picks are rebuilt on. NOT a grid column preference: the time grid
   * always shows every active court, so a reload can't collapse it to the one
   * court someone happened to pick.
   */
  courtIds: string[];
  selectedSlots: string[];
  slotGroups: CourtSlotGroup[];
  paddleQty: number;
  ball: boolean;
  details: DetailsValues | null;
  idempotencyKey: string | null;
  /** Set when a draft was restored after a reload, so the UI can say so. */
  restored?: boolean;
}

/** New unguessable owner token for a fresh booking session. */
export function newOwnerToken(): string {
  return crypto.randomUUID();
}

function storage(kind: "sessionStorage" | "localStorage"): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function read(store: Storage, key: string): BookingDraft | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraft> & { savedAt?: number };
    if (parsed.v !== 1 || typeof parsed.ownerToken !== "string" || parsed.ownerToken.length < 16) return null;
    if (parsed.savedAt !== undefined) {
      if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > DRAFT_TTL_MS || parsed.savedAt > Date.now()) return null;
      delete parsed.savedAt;
    }
    return parsed as BookingDraft;
  } catch {
    return null;
  }
}

/** Read recoverable draft first; session-only v1 drafts remain compatible. */
export function loadDraft(): BookingDraft | null {
  const session = storage("sessionStorage");
  const recovery = storage("localStorage");
  let recoveryRaw: string | null = null;
  try { recoveryRaw = recovery?.getItem(RECOVERY_KEY) ?? null; } catch { /* storage is optional */ }
  const restored = recovery && read(recovery, RECOVERY_KEY);
  if (restored) return restored;
  if (recoveryRaw !== null && recovery) {
    try { recovery.removeItem(RECOVERY_KEY); } catch { /* ignore */ }
    try { session?.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return null;
  }
  const legacy = session && read(session, DRAFT_KEY);
  if (legacy) return legacy;
  if (session) { try { session.removeItem(DRAFT_KEY); } catch { /* ignore */ } }
  return null;
}

export function saveDraft(draft: BookingDraft): void {
  const session = storage("sessionStorage");
  const recovery = storage("localStorage");
  const value = JSON.stringify({ ...draft, savedAt: Date.now() });
  try { session?.setItem(DRAFT_KEY, value); } catch { /* storage is optional */ }
  try { recovery?.setItem(RECOVERY_KEY, value); } catch { /* storage is optional */ }
}

export function clearDraft(): void {
  for (const [store, key] of [[storage("sessionStorage"), DRAFT_KEY], [storage("localStorage"), RECOVERY_KEY]] as const) {
    try { store?.removeItem(key); } catch { /* ignore */ }
  }
}
