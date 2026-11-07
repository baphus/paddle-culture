import { test } from "node:test";
import assert from "node:assert/strict";
import { clearDraft, loadDraft, saveDraft, type BookingDraft } from "../src/lib/booking/draft.ts";

const draft = { v: 1, ownerToken: "0123456789abcdef", step: "details", hold: null, selectedDate: null, courtIds: [], selectedSlots: [], slotGroups: [], paddleQty: 0, ball: false, details: null, idempotencyKey: null } as BookingDraft;

function stores() {
  const make = () => {
    const data = new Map<string, string>();
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) } as unknown as Storage;
  };
  const sessionStorage = make();
  const localStorage = make();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage, localStorage } });
  return { sessionStorage, localStorage };
}

test("draft recovers across tabs and clears both copies", () => {
  const { sessionStorage, localStorage } = stores();
  saveDraft(draft);
  sessionStorage.removeItem("pc.booking.draft.v1");
  assert.deepEqual(loadDraft(), draft);
  clearDraft();
  assert.equal(localStorage.getItem("pc.booking.draft.v1.recovery"), null);
});

test("expired and corrupt recovery drafts are removed without reviving expired session copy", () => {
  const { sessionStorage, localStorage } = stores();
  sessionStorage.setItem("pc.booking.draft.v1", JSON.stringify(draft));
  localStorage.setItem("pc.booking.draft.v1.recovery", JSON.stringify({ ...draft, savedAt: Date.now() - 40 * 60 * 1000 - 1 }));
  assert.equal(loadDraft(), null);
  localStorage.setItem("pc.booking.draft.v1.recovery", "{");
  assert.equal(loadDraft(), null);
});

test("legacy session-only v1 drafts remain readable; unavailable storage is safe", () => {
  const { sessionStorage } = stores();
  sessionStorage.setItem("pc.booking.draft.v1", JSON.stringify(draft));
  assert.deepEqual(loadDraft(), draft);
  const throwingStorage = { getItem() { throw new Error("disabled"); } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage, localStorage: throwingStorage } });
  assert.deepEqual(loadDraft(), draft);
  Object.defineProperty(globalThis, "window", { configurable: true, get() { throw new Error("disabled"); } });
  assert.equal(loadDraft(), null);
  saveDraft(draft);
  clearDraft();
});
