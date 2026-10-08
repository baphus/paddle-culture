import QRCode from "qrcode";
import {
  OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED,
  OUTBOX_TEMPLATE_OWNER_ALERT,
} from "../booking/constants";

// Transactional templates (ADR-05). Submit writes the first two; the
// approve/reject decision lane writes the latter two with the payload
// contracts documented below.

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
  courtName?: unknown;
  slotStart?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const SLOT_DURATION_MS = 60 * 60 * 1000; // 1-hour slots

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return timeFmt.format(d);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

// Collapsed slot: consecutive 1-hour blocks on the same court become a range.
interface CourtSession {
  court: string;
  date: string;       // e.g. "Tuesday, October 6, 2026"
  timeRange: string;  // e.g. "7:00 AM – 9:00 AM" or just "9:00 AM – 10:00 AM"
  hours: number;
}

function collapseSlots(p: Payload): CourtSession[] {
  const raw = Array.isArray(p.slots) ? (p.slots as SlotSummary[]) : [];
  if (!raw.length) return [];

  // Sort by court, then by time.
  const sorted = [...raw].sort((a, b) => {
    const ca = str(a.courtId);
    const cb = str(b.courtId);
    if (ca !== cb) return ca.localeCompare(cb);
    return new Date(str(a.slotStart)).getTime() - new Date(str(b.slotStart)).getTime();
  });

  const sessions: CourtSession[] = [];
  let i = 0;
  while (i < sorted.length) {
    const current = sorted[i]!;
    const courtId = str(current.courtId);
    const courtName = str(current.courtName, str(current.courtId, "Court"));
    const startIso = str(current.slotStart);
    const startMs = new Date(startIso).getTime();
    if (Number.isNaN(startMs)) {
      sessions.push({ court: courtName, date: startIso, timeRange: startIso, hours: 1 });
      i++;
      continue;
    }

    // Extend run while same court and consecutive 1-hour slots.
    let endMs = startMs + SLOT_DURATION_MS;
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j]!;
      if (str(next.courtId) !== courtId) break;
      const nextMs = new Date(str(next.slotStart)).getTime();
      if (nextMs !== endMs) break;
      endMs += SLOT_DURATION_MS;
      j++;
    }

    const hours = j - i;
    const endIso = new Date(endMs).toISOString();
    sessions.push({
      court: courtName,
      date: formatDate(startIso),
      timeRange: `${formatTime(startIso)} – ${formatTime(endIso)}`,
      hours,
    });
    i = j;
  }

  return sessions;
}

// Map timeBand values from pricing detail strings to human-readable labels.
const TIME_BAND_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  all: "Court",
};

interface PriceLine {
  kind?: unknown;
  detail?: unknown;
  amount?: unknown;
  unitAmount?: unknown;
  courtId?: unknown;
}

// Build clean invoice lines from the raw pricing lines written by recalculateTotal.
// Court lines (one raw row per slot) are aggregated: same court + unit rate →
// one row: "CourtName — Morning/Evening (Nh) @ ₱X/hr  ₱Y.00"
function linesOf(
  p: Payload,
  sessions: CourtSession[],
): Array<{ label: string; amount: string }> {
  const raw = Array.isArray(p.lines) ? (p.lines as PriceLine[]) : [];

  // Build a courtId → name lookup from the slots in the payload.
  const courtNameById = new Map<string, string>();
  const rawSlots = Array.isArray(p.slots) ? (p.slots as SlotSummary[]) : [];
  for (const s of rawSlots) {
    const id = str(s.courtId);
    const name = str(s.courtName, str(s.courtId, "Court"));
    if (id) courtNameById.set(id, name);
  }

  // Aggregate court lines by (courtId, unitAmount).
  interface CourtAccum {
    courtName: string;
    unitAmount: string;
    totalCents: number;
    count: number;
    timeBands: Set<string>;
  }
  const courtAccum = new Map<string, CourtAccum>();
  const otherLines: Array<{ label: string; amount: string }> = [];

  for (const l of raw) {
    const kind = str(l.kind);
    const rawDetail = str(l.detail, "Fee");
    const amount = str(l.amount);
    const unitAmount = str(l.unitAmount, amount);
    const courtId = str(l.courtId ?? "");

    if (kind === "court" && courtId) {
      const key = `${courtId}::${unitAmount}`;
      // Extract timeBand from "weekday/evening @ …"
      const bandMatch = rawDetail.match(/\/([a-z]+)\s*@/i);
      const band = bandMatch ? (bandMatch[1] ?? "").toLowerCase() : "";
      const existing = courtAccum.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalCents += Math.round(Number(amount) * 100);
        if (band) existing.timeBands.add(band);
      } else {
        courtAccum.set(key, {
          courtName: courtNameById.get(courtId) ?? "Court",
          unitAmount,
          totalCents: Math.round(Number(amount) * 100),
          count: 1,
          timeBands: band ? new Set([band]) : new Set(),
        });
      }
    } else if (kind === "paddle") {
      otherLines.push({ label: rawDetail, amount });
    } else if (kind === "ball") {
      otherLines.push({ label: "Ball fee", amount });
    } else {
      otherLines.push({ label: rawDetail, amount });
    }
  }

  // Approved/rejected payloads don't carry lines — fall back to sessions.
  if (raw.length === 0 && sessions.length > 0) {
    return sessions.map((s) => ({ label: `${s.court} (${s.hours}h)`, amount: "" }));
  }

  const courtLines: Array<{ label: string; amount: string }> = [];
  for (const acc of courtAccum.values()) {
    const bands = [...acc.timeBands];
    const bandLabel =
      bands.length === 1
        ? (TIME_BAND_LABEL[bands[0] ?? ""] ?? "Court")
        : bands.length > 1
          ? bands.map((b) => TIME_BAND_LABEL[b] ?? b).join(" / ")
          : "Court";
    const totalAmount = (acc.totalCents / 100).toFixed(2);
    courtLines.push({
      label: `${acc.courtName} — ${bandLabel} (${acc.count}h) @ ₱${acc.unitAmount}/hr`,
      amount: totalAmount,
    });
  }

  return [...courtLines, ...otherLines];
}

function bookingUrl(token: string): string | null {
  const base = (process.env.APP_URL || "https://ckgrounds.vercel.app").replace(/\/$/, "");
  if (!base || !token) return null;
  return `${base}/track/${token}`;
}

function logoUrl(): string | null {
  const base = (process.env.APP_URL || "https://ckgrounds.vercel.app").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/logo.jpg`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function qrDataUri(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: "#26422a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------

const BRAND = {
  flame: "#ea662c",
  pine: "#26422a",
  cream: "#fff8ef",
  oat: "#fff3d4",
  line: "#e8ddc8",
  ink: "#3c3835",
  muted: "#7a7268",
  white: "#ffffff",
  liveGreen: "#2e7d32",
  liveBg: "#eaf5ec",
  errorRed: "#ba1a1a",
  errorBg: "#fce8e6",
};

// ---------------------------------------------------------------------------
// HTML shell (table-based, inline styles, email-client-safe)
// ---------------------------------------------------------------------------

function emailShell(opts: { preheader: string; body: string }): string {
  const logo = logoUrl();
  const logoImg = logo
    ? `<img src="${escapeHtml(logo)}" alt="CK Grounds" width="72" height="72"
         style="display:block;border-radius:8px;border:0;" />`
    : `<span style="font-size:22px;font-weight:700;color:${BRAND.white};">CK Grounds</span>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>CK Grounds</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.cream};
             font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(opts.preheader)}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:${BRAND.cream};">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td align="center"
              style="background-color:${BRAND.pine};border-radius:12px 12px 0 0;
                     padding:24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">${logoImg}</td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-size:21px;font-weight:700;
                             color:${BRAND.white};letter-spacing:-0.3px;">CK Grounds</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background-color:${BRAND.white};padding:36px 40px;
                     border-radius:0 0 12px 12px;">
            ${opts.body}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="margin-top:32px;">
              <tr>
                <td style="border-top:1px solid ${BRAND.line};padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.6;">
                    This email was sent by the CK Grounds booking system.
                    Do not share your booking link with others.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Re-usable HTML blocks
// ---------------------------------------------------------------------------

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.8px;
                     text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(text)}</p>`;
}

function sessionsBlock(sessions: CourtSession[]): string {
  if (!sessions.length) return "";
  const rows = sessions
    .map(
      (s) => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid ${BRAND.line};">
          <span style="font-size:13px;font-weight:600;color:${BRAND.pine};">
            ${escapeHtml(s.court)}
          </span><br />
          <span style="font-size:13px;color:${BRAND.ink};">
            ${escapeHtml(s.date)}
          </span><br />
          <span style="font-size:13px;color:${BRAND.ink};">
            ${escapeHtml(s.timeRange)}
            <span style="color:${BRAND.muted};">(${s.hours}h)</span>
          </span>
        </td>
      </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid ${BRAND.line};border-radius:8px;margin-bottom:24px;
                  border-collapse:collapse;">
      ${rows}
    </table>`;
}

// Invoice-style pricing table: line items + total row.
// Skips the amount column when amount is empty (approved/rejected fallback rows).
function invoiceBlock(
  lines: Array<{ label: string; amount: string }>,
  total: string,
): string {
  if (!lines.length && !total) return "";

  const lineRows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:${BRAND.ink};border-bottom:1px solid ${BRAND.line};">
          ${escapeHtml(l.label)}
        </td>
        <td style="padding:8px 0;font-size:14px;color:${BRAND.ink};border-bottom:1px solid ${BRAND.line};
                   text-align:right;white-space:nowrap;">
          ${l.amount ? `₱${escapeHtml(l.amount)}` : ""}
        </td>
      </tr>`,
    )
    .join("");

  const totalRow = total
    ? `<tr>
        <td style="padding:12px 0 0;font-size:15px;font-weight:700;color:${BRAND.pine};">
          Total
        </td>
        <td style="padding:12px 0 0;font-size:15px;font-weight:700;color:${BRAND.pine};
                   text-align:right;white-space:nowrap;">
          ₱${escapeHtml(total)}
        </td>
      </tr>`
    : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin-bottom:24px;">
      ${lineRows}
      ${totalRow}
    </table>`;
}

function customerBlock(name: string, email: string, phone: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0"
           style="margin-bottom:24px;width:100%;">
      <tr>
        <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;width:56px;">Name</td>
        <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;font-weight:600;">
          ${escapeHtml(name)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Email</td>
        <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">
          ${escapeHtml(email)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Phone</td>
        <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">
          ${escapeHtml(phone)}</td>
      </tr>
    </table>`;
}

function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${BRAND.flame};">
          <a href="${escapeHtml(url)}"
             style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;
                    color:${BRAND.white};text-decoration:none;border-radius:8px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function statusBadge(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;
                        font-size:12px;font-weight:700;letter-spacing:0.5px;
                        background-color:${bg};color:${fg};">${escapeHtml(text)}</span>`;
}

function greeting(name: string): string {
  return `<p style="margin:0 0 20px;font-size:16px;color:${BRAND.ink};">
    Hi <strong>${escapeHtml(name)}</strong>,
  </p>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">
    ${escapeHtml(text)}
  </p>`;
}

function linkFallback(url: string): string {
  return `<p style="margin:8px 0 0;font-size:12px;color:${BRAND.muted};word-break:break-all;">
    <a href="${escapeHtml(url)}" style="color:${BRAND.flame};text-decoration:none;">${escapeHtml(url)}</a>
  </p>`;
}

// ---------------------------------------------------------------------------
// Plain-text helpers
// ---------------------------------------------------------------------------

function textSessions(sessions: CourtSession[]): string[] {
  return sessions.map((s) => `  ${s.court} — ${s.date}, ${s.timeRange} (${s.hours}h)`);
}

function textInvoice(
  lines: Array<{ label: string; amount: string }>,
  total: string,
): string[] {
  const out = lines.map((l) => (l.amount ? `  ${l.label}: ₱${l.amount}` : `  ${l.label}`));
  if (total) out.push(`  ─────────────`, `  Total: ₱${total}`);
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderOutboxEmail(
  template: string,
  payload: Payload,
): Promise<RenderedEmail> {
  const trackingToken = str(payload.trackingToken);
  const fullName = str(payload.fullName, "there");
  const email = str(payload.email);
  const phone = str(payload.phone);
  const total = str(payload.total);
  const url = bookingUrl(trackingToken);
  const sessions = collapseSlots(payload);
  const lines = linesOf(payload, sessions);

  switch (template) {
    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED: {
      const textLines = [
        `Hi ${fullName},`,
        "",
        "We received your booking. Our team will verify your payment proof and",
        "confirm or reject it shortly.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        "",
        "INVOICE",
        ...textInvoice(lines, total),
        ...(url ? ["", "Track your booking:", url] : []),
        "",
        "Keep your payment proof until your booking is confirmed.",
        "— CK Grounds",
      ];

      const htmlBody = `
        ${greeting(fullName)}
        <div style="margin-bottom:20px;">${statusBadge("Pending Review", BRAND.oat, BRAND.pine)}</div>
        ${p("We received your booking. Our team will verify your payment proof and confirm or reject it shortly.")}

        ${sectionLabel("Customer")}
        ${customerBlock(fullName, email, phone)}

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        ${lines.length || total ? `${sectionLabel("Invoice")}${invoiceBlock(lines, total)}` : ""}

        ${url ? `${sectionLabel("Track your booking")}${ctaButton("View Booking Status", url)}${linkFallback(url)}` : ""}

        <div style="margin-top:24px;padding:14px 16px;background-color:${BRAND.cream};
                    border-left:3px solid ${BRAND.flame};border-radius:0 6px 6px 0;">
          <p style="margin:0;font-size:13px;color:${BRAND.ink};line-height:1.5;">
            Keep your payment proof until your booking is confirmed.
          </p>
        </div>`;

      return {
        subject: "CK Grounds — booking received",
        text: textLines.join("\n"),
        html: emailShell({ preheader: "Your booking is pending review.", body: htmlBody }),
      };
    }

    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_OWNER_ALERT: {
      const textLines = [
        `New booking from ${fullName} — action needed`,
        "Verify the payment proof, then approve or reject in the admin panel.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        "",
        "INVOICE",
        ...textInvoice(lines, total),
        ...(url ? ["", url] : []),
      ];

      const htmlBody = `
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${BRAND.pine};">
          New booking — action needed
        </h2>

        ${sectionLabel("Customer")}
        <table role="presentation" cellpadding="0" cellspacing="0"
               style="margin-bottom:24px;width:100%;">
          <tr>
            <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;width:56px;">Name</td>
            <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;font-weight:600;">
              ${escapeHtml(fullName)}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Email</td>
            <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">
              <a href="mailto:${escapeHtml(email)}"
                 style="color:${BRAND.flame};text-decoration:none;">${escapeHtml(email)}</a>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;color:${BRAND.muted};padding:5px 0;">Phone</td>
            <td style="font-size:14px;color:${BRAND.ink};padding:5px 0;">${escapeHtml(phone)}</td>
          </tr>
        </table>

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        ${lines.length || total ? `${sectionLabel("Invoice")}${invoiceBlock(lines, total)}` : ""}

        ${url ? `${ctaButton("Open in Admin Panel", url)}${linkFallback(url)}` : ""}`;

      return {
        subject: `CK Grounds — new booking from ${fullName || "customer"}`,
        text: textLines.join("\n"),
        html: emailShell({ preheader: `New booking from ${fullName}.`, body: htmlBody }),
      };
    }

    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_CUSTOMER_APPROVED: {
      const qrDataUrl = url ? await qrDataUri(url) : null;

      const textLines = [
        `Hi ${fullName},`,
        "",
        "Your booking is confirmed. Show the QR code below at the venue to check in.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        ...(total ? ["", `Total: ₱${total}`] : []),
        ...(url ? ["", "YOUR QR PASS", url] : []),
        "",
        "See you on the court!",
        "— CK Grounds",
      ];

      const qrSection = url
        ? `${sectionLabel("QR check-in pass")}
           ${p("Show this at the venue to check in.")}
           ${
             qrDataUrl
               ? `<table role="presentation" cellpadding="0" cellspacing="0"
                       style="margin-bottom:16px;">
                   <tr>
                     <td style="background:${BRAND.white};border:2px solid ${BRAND.line};
                                border-radius:12px;padding:16px;display:inline-block;">
                       <img src="${qrDataUrl}" width="180" height="180"
                            alt="QR check-in pass" style="display:block;border:0;" />
                     </td>
                   </tr>
                 </table>`
               : ""
           }
           ${ctaButton("Open QR Pass", url)}
           ${linkFallback(url)}`
        : "";

      const htmlBody = `
        ${greeting(fullName)}
        <div style="margin-bottom:20px;">${statusBadge("Confirmed", BRAND.liveBg, BRAND.liveGreen)}</div>
        ${p("Your booking is confirmed. Show the QR code below at the venue to check in.")}

        ${sectionLabel("Customer")}
        ${customerBlock(fullName, email, phone)}

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        ${total ? `${sectionLabel("Total")}${invoiceBlock([], total)}` : ""}

        ${qrSection}`;

      return {
        subject: "CK Grounds — booking confirmed",
        text: textLines.join("\n"),
        html: emailShell({
          preheader: "Your booking is confirmed — QR pass inside.",
          body: htmlBody,
        }),
      };
    }

    // -----------------------------------------------------------------------
    case OUTBOX_TEMPLATE_CUSTOMER_REJECTED: {
      const reason = str(payload.rejectReason, "No reason provided.");

      const textLines = [
        `Hi ${fullName},`,
        "",
        "Your booking was not approved and your slots have been released.",
        "",
        `Name:  ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        "",
        "BOOKING",
        ...textSessions(sessions),
        "",
        `Reason: ${reason}`,
        "",
        ...(url ? ["Booking reference:", url, ""] : []),
        "If you believe this is a mistake, reply to this email.",
        "— CK Grounds",
      ];

      const htmlBody = `
        ${greeting(fullName)}
        <div style="margin-bottom:20px;">${statusBadge("Not Approved", BRAND.errorBg, BRAND.errorRed)}</div>
        ${p("Your booking was not approved and your slots have been released.")}

        ${sectionLabel("Customer")}
        ${customerBlock(fullName, email, phone)}

        ${sectionLabel("Booking")}
        ${sessionsBlock(sessions)}

        <div style="margin-bottom:24px;padding:14px 16px;background-color:${BRAND.errorBg};
                    border-left:3px solid ${BRAND.errorRed};border-radius:0 6px 6px 0;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.8px;
                    text-transform:uppercase;color:${BRAND.errorRed};">Reason</p>
          <p style="margin:0;font-size:14px;color:${BRAND.ink};line-height:1.5;">
            ${escapeHtml(reason)}
          </p>
        </div>

        ${url ? `${sectionLabel("Booking reference")}${ctaButton("View Booking", url)}${linkFallback(url)}` : ""}

        ${p("If you believe this is a mistake or would like to re-book, reply to this email.")}`;

      return {
        subject: "CK Grounds — booking not approved",
        text: textLines.join("\n"),
        html: emailShell({
          preheader: "Your booking could not be confirmed.",
          body: htmlBody,
        }),
      };
    }

    // -----------------------------------------------------------------------
    default:
      throw new Error(`UNKNOWN_TEMPLATE:${template}`);
  }
}
