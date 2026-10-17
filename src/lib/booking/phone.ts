// Customer + venue numbers are stored/shown in local PH form (`09123456789`),
// never with the 63 country code. Accepts `+63…`, `63…`, `9…` and any spacing
// or punctuation, and returns digits only.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63")) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  return digits;
}

/**
 * True for a normalised PH mobile number: `09` + 9 digits (11 total), which is
 * the only shape a customer can actually be reached on. Landlines are not
 * accepted — a booking nobody can be called about is a support ticket, not a
 * booking. Runs on the *output* of normalizePhone.
 */
export function isValidPhMobile(normalized: string): boolean {
  return /^09\d{9}$/.test(normalized);
}
