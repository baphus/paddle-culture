// Customer + venue numbers are stored/shown in local PH form (`09123456789`),
// never with the 63 country code. Accepts `+63…`, `63…`, `9…` and any spacing
// or punctuation, and returns digits only.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("63")) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  return digits;
}
