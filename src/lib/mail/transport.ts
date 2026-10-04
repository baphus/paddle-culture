import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Gmail transport (ADR-05). App Password from env — never logged, never
// printed. No `server-only` import here so the Netlify scheduled function can
// bundle this module with esbuild (`src/lib/mailer.ts` keeps the guard for
// Next.js importers). No top-level transport creation: safe at build time
// with missing env.

// Port 587/STARTTLS per ADR-05 (465/OAuth2 is the documented alternative,
// not implemented — App Password path only).
export function getTransport(): Transporter {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("NOT_CONFIGURED");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

// One shared transport per process/invocation (ADR-05: reuse, don't
// reconnect per email). Lazy singleton — still build-safe with missing env.
let shared: Transporter | null = null;

export function getSharedTransport(): Transporter {
  if (!shared) shared = getTransport();
  return shared;
}

export function fromAddress(): string {
  const user = process.env.GMAIL_USER;
  if (!user) throw new Error("NOT_CONFIGURED");
  return user;
}
