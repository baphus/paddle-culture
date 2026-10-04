import {
  OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED,
  OUTBOX_TEMPLATE_OWNER_ALERT,
} from "../booking/constants";

// Transactional templates (ADR-05). Submit writes the first two; the
// approve/reject decision lane writes the latter two with the payload
// contracts documented below. Plain-text first, minimal HTML twin.

// Decision-lane template names (no rows exist yet — defined here so the
// worker can send them the moment the decision lane writes them).
export const OUTBOX_TEMPLATE_CUSTOMER_APPROVED = "booking_customer_approved";
export const OUTBOX_TEMPLATE_CUSTOMER_REJECTED = "booking_customer_rejected";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Payload = Record<string, unknown>;

interface SlotSummary {
  courtId?: unknown;
  slotStart?: unknown;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function slotsOf(p: Payload): string[] {
  const raw = Array.isArray(p.slots) ? (p.slots as SlotSummary[]) : [];
  return raw.map((s) => formatSlotStart(str(s.slotStart)));
}

function linesOf(p: Payload): string[] {
  const raw = Array.isArray(p.lines) ? p.lines : [];
  return (raw as Payload[]).map((l) => {
    const detail = str(l.detail);
    const amount = str(l.amount);
    return detail ? `${detail} — ₱${amount}` : `₱${amount}`;
  });
}

const manilaFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatSlotStart(iso: string): string {
  if (!iso) return "unspecified time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${manilaFmt.format(d)} (Manila)`;
}

function trackingUrl(token: string): string | null {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!base || !token) return null;
  return `${base}/track/${token}`;
}

function htmlWrap(title: string, lines: string[]): string {
  const items = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  return `<!doctype html><html><body><h2>${escapeHtml(title)}</h2>${items}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render an outbox row. Throws on unknown template or unusable payload —
 * the worker dead-letters such rows (data bug, never worth 8 retries).
 */
export function renderOutboxEmail(
  template: string,
  payload: Payload,
): RenderedEmail {
  const trackingToken = str(payload.trackingToken);
  const fullName = str(payload.fullName, "there");
  const total = str(payload.total);
  const url = trackingUrl(trackingToken);

  switch (template) {
    case OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED: {
      const lines = [
        `Hi ${fullName},`,
        "We received your booking request. Status: Pending — our team will verify your payment proof and approve or reject it.",
        ...slotsOf(payload).map((s) => `Slot: ${s}`),
        ...linesOf(payload),
        ...(total ? [`Total: ₱${total}`] : []),
        ...(url ? [`Track your booking: ${url}`] : []),
        "Please keep your proof of payment until your booking is approved.",
      ];
      return {
        subject: "Paddle Culture — booking received (Pending)",
        text: lines.join("\n"),
        html: htmlWrap("Booking received — Pending", lines),
      };
    }

    case OUTBOX_TEMPLATE_OWNER_ALERT: {
      const lines = [
        "New booking submitted — action needed (verify proof, then approve/reject in admin).",
        `Name: ${fullName}`,
        `Email: ${str(payload.email)}`,
        `Phone: ${str(payload.phone)}`,
        ...slotsOf(payload).map((s) => `Slot: ${s}`),
        ...linesOf(payload),
        ...(total ? [`Total: ₱${total}`] : []),
        ...(trackingToken ? [`Tracking token: ${trackingToken}`] : []),
      ];
      return {
        subject: `Paddle Culture — new booking from ${fullName || "customer"}`,
        text: lines.join("\n"),
        html: htmlWrap("New booking — action needed", lines),
      };
    }

    case OUTBOX_TEMPLATE_CUSTOMER_APPROVED: {
      const lines = [
        `Hi ${fullName},`,
        "Good news — your booking is APPROVED. Show the QR / tracking link below at the venue.",
        ...slotsOf(payload).map((s) => `Slot: ${s}`),
        ...(total ? [`Total paid: ₱${total}`] : []),
        ...(url ? [`Your booking pass: ${url}`] : []),
      ];
      return {
        subject: "Paddle Culture — booking approved",
        text: lines.join("\n"),
        html: htmlWrap("Booking approved", lines),
      };
    }

    case OUTBOX_TEMPLATE_CUSTOMER_REJECTED: {
      const reason = str(payload.rejectReason, "No reason given.");
      const lines = [
        `Hi ${fullName},`,
        "Your booking was REJECTED and your slots have been released.",
        `Reason: ${reason}`,
        ...(url ? [`Details: ${url}`] : []),
        "Reply to this email if you believe this is a mistake.",
      ];
      return {
        subject: "Paddle Culture — booking rejected",
        text: lines.join("\n"),
        html: htmlWrap("Booking rejected", lines),
      };
    }

    default:
      throw new Error(`UNKNOWN_TEMPLATE:${template}`);
  }
}
