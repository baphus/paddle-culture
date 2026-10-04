import "server-only";
import type { Transporter } from "nodemailer";

// Back-compat shim: the real implementation lives in src/lib/mail/transport
// (kept free of `server-only` so the Netlify scheduled function can bundle
// it). This module keeps the server-only guard for Next.js importers.
export {
  fromAddress,
  getSharedTransport,
  getTransport,
} from "./mail/transport";
export type { Transporter };
