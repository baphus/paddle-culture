import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Gmail transport (ADR-05). App Password from env — never logged, never
// printed. No `server-only` import here so the Netlify scheduled function can
// bundle this module with esbuild. No top-level transport creation: safe at
// build time with missing env.

// Port 587/STARTTLS per ADR-05 (465/OAuth2 is the documented alternative,
// not implemented — App Password path only).
//
// Local dev (e.g. Mailpit on 127.0.0.1:1025, no auth):
//   SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_SECURE=false MAIL_FROM=noreply@localhost
// When SMTP_HOST is unset, falls back to the Gmail path (GMAIL_USER +
// GMAIL_APP_PASSWORD) so production is untouched.
export function getTransport(): Transporter {
  const smtpHost = process.env.SMTP_HOST;

  // Explicit local/custom SMTP path — auth optional (Mailpit has none).
  if (smtpHost) {
    const port = Number.parseInt(process.env.SMTP_PORT ?? "1025", 10) || 1025;
    const secure =
      process.env.SMTP_SECURE?.toLowerCase() === "true" || port === 465;
    const user = process.env.SMTP_USER || undefined;
    const pass = process.env.SMTP_PASS || undefined;
    return nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

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

// Test/dev helper: drop the cached transport so env changes take effect
// without a process restart.
export function resetSharedTransport(): void {
  shared = null;
}

export function fromAddress(): string {
  const from =
    process.env.MAIL_FROM ?? process.env.SMTP_USER ?? process.env.GMAIL_USER;
  if (!from) throw new Error("NOT_CONFIGURED");
  return from;
}
