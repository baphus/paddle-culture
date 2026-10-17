/** Display-safe contact details for pages reachable by a tracking link alone. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  if (!domain) return "•••";
  return `${user.charAt(0)}•••@${domain}`;
}

/** Keeps the last 3 digits so the customer recognises the number, nothing more. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `${"•".repeat(digits.length - 3)}${digits.slice(-3)}`;
}
