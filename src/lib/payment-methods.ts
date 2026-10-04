// ============================================================================
// PAYMENT METHODS — ★ OWNER INPUT REQUIRED ★
//
// THIS IS THE ONE AND ONLY FILE holding customer-facing payment copy:
// account names/numbers, instructions, and QR image paths. Edit ONLY this
// file to go live with real payment details.
//
// TODO (owner) before launch:
//   1. Replace every "TODO_OWNER_…" accountName / accountNumber below with the
//      real merchant account name + number for GCash, BDO, and BPI.
//   2. Drop the matching QR images into `public/payment-qr/` with EXACTLY
//      these filenames:  gcash.png · bdo.png · bpi.png
//      (PNG preferred; the booking page renders `<qrPath>` and shows a
//      graceful text fallback automatically when a file is absent, so the
//      site still builds and runs without them.)
//   3. Flip each method's `configured` flag to true once its details + QR
//      are in place. Unconfigured methods render as "coming soon" and cannot
//      be selected at checkout.
//   4. Adjust `instructions` wording per method if needed (kept generic now).
//
// DO NOT invent real account numbers in code — placeholders ship on purpose.
// ============================================================================

export interface PaymentMethod {
  id: "gcash" | "bdo" | "bpi";
  label: string;
  /** Displayed account name. TODO_OWNER_* = replace before launch. */
  accountName: string;
  /** Displayed account number. TODO_OWNER_* = replace before launch. */
  accountNumber: string;
  /** Per-method payer instructions shown at checkout. */
  instructions: string;
  /** Served from `public/payment-qr/*.png`; fallback shown when missing. */
  qrPath: string;
  /** Owner flips to true once details + QR image are live. */
  configured: boolean;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "gcash",
    label: "GCash",
    accountName: "TODO_OWNER_GCASH_NAME",
    accountNumber: "TODO_OWNER_GCASH_NUMBER",
    instructions:
      "Send the exact booking total to the GCash account below, then screenshot the confirmation and upload it as your payment proof.",
    qrPath: "/payment-qr/gcash.png",
    configured: false,
  },
  {
    id: "bdo",
    label: "BDO",
    accountName: "TODO_OWNER_BDO_NAME",
    accountNumber: "TODO_OWNER_BDO_NUMBER",
    instructions:
      "Transfer the exact booking total to the BDO account below (InstaPay/PESONet accepted), then screenshot the confirmation and upload it as your payment proof.",
    qrPath: "/payment-qr/bdo.png",
    configured: false,
  },
  {
    id: "bpi",
    label: "BPI",
    accountName: "TODO_OWNER_BPI_NAME",
    accountNumber: "TODO_OWNER_BPI_NUMBER",
    instructions:
      "Transfer the exact booking total to the BPI account below (InstaPay/PESONet accepted), then screenshot the confirmation and upload it as your payment proof.",
    qrPath: "/payment-qr/bpi.png",
    configured: false,
  },
];

/** Shown under every method at checkout (same for all methods). */
export const PAYMENT_NOTE =
  "Upload a clear screenshot of your transfer confirmation (JPG, PNG, or WebP, max 5MB). Your booking stays Pending until the owner verifies the payment — watch your email for the approval confirmation.";
