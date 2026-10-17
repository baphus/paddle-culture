// ============================================================================
// PAYMENT METHODS — customer-facing payment config: labels and QR image paths.
// Edit ONLY this file to change what checkout offers.
//
// The owner's QR images carry the account details (some characters redacted
// for the owner's privacy), so checkout shows the QR alone — no account text.
//
// QR images live in `public/payment-qr/`. `qrPath` must match the filename
// exactly (case-sensitive on Vercel); the booking page shows a graceful
// fallback when a file is absent, so the site builds and runs without it.
//
// `configured: false` adds a "Soon" badge to the method tab at checkout.
// ============================================================================

export interface PaymentMethod {
  id: "gcash" | "bdo" | "bpi";
  label: string;
  /** Served from `public/payment-qr/`; fallback shown when missing. */
  qrPath: string;
  /** Brand mark served from `public/`. */
  logoPath: string;
  /** Owner flips to true once the QR image is live. */
  configured: boolean;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "gcash",
    label: "GCash",
    qrPath: "/payment-qr/GCASH_QR_CODE.jpg",
    logoPath: "/gcash.png",
    configured: true,
  },
  {
    id: "bdo",
    label: "BDO",
    qrPath: "/payment-qr/BDO_QR_CODE.jpg",
    logoPath: "/bdo.png",
    configured: true,
  },
  {
    id: "bpi",
    label: "BPI",
    qrPath: "/payment-qr/BPI_QR_CODE.jpg",
    logoPath: "/bpi.png",
    configured: true,
  },
];

/** Shown under the QR at checkout (same for all methods). */
export const PAYMENT_INSTRUCTION =
  "Send the exact booking total to the account in the QR, then upload your payment screenshot as proof.";

/** Shown under every method at checkout (same for all methods). */
export const PAYMENT_NOTE =
  "Upload a clear screenshot of your transfer confirmation (JPG, PNG, or WebP, max 5MB). Your booking stays Pending until the owner verifies the payment — watch your email for the approval confirmation.";
