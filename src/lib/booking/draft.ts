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
 * We persist to sessionStorage, not localStorage: the draft is per-tab and
 * dies with it, which is the right lifetime for "this booking attempt". The
 * one value that must outlive a reload is the hold owner token, and that is
 * carried inside the hold itself.
 *
 * Nothing here is trusted: the server re-validates the hold, the slots and the
 * prices on every read and write. This is purely so the customer does not have
 * to retype their details after the browser threw them away.
 */

const DRAFT_KEY = "pc.booking.draft.v1";

export type DraftStep = "select" | "details" | "payment";

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

function storage(): Storage | null {
  try {
    // Safari private mode and some embedded webviews throw on access.
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read the draft, dropping anything unreadable or from an older shape. */
export function loadDraft(): BookingDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.ownerToken !== "string" || parsed.ownerToken.length < 16) return null;
    return parsed as BookingDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: BookingDraft): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota / disabled storage: the wizard still works, it just stops
    // surviving a reload. Never block a booking over this.
  }
}

export function clearDraft(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
