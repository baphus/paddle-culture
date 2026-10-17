// Customer + venue emails are validated only for format; this helper
// suggests corrections for common typos in well-known providers.

export interface EmailSuggestion {
  suggestion: string; // The suggested domain (e.g., "gmail.com")
  correctedEmail: string; // The full email with the suggested domain
}

// Well-known providers we are confident enough about to nudge on.
const PROVIDERS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
];

// TLD typos: the domain is a real provider except the ending was mistyped.
const TLD_TYPOS: Record<string, string> = {
  con: "com",
  comm: "com",
  ocm: "com",
  vom: "com",
  cmo: "com",
};

/** Damerau-Levenshtein (optimal string alignment) distance. */
function distance(a: string, b: string): number {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = new Array(b.length + 1).fill(0);
    d[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost); // transposition
      }
    }
  }
  return d[a.length][b.length];
}

/** True when `domain` is exactly one of the known providers. */
function isExactProvider(domain: string): boolean {
  return PROVIDERS.includes(domain);
}

/**
 * Given a raw email string, return a suggestion if the domain looks like a
 * common typo of a known email provider. Returns null when the address already
 * looks right, or when we are not confident enough to say otherwise.
 *
 * Strategy, in order:
 *   1. Skip anything that is already an exact known provider.
 *   2. Drop the last label when it is a mistyped TLD (gmail.con -> gmail.com).
 *   3. Drop a doubled suffix (gmail.com.con -> gmail.com).
 *   4. Fix a mistyped provider name within edit distance 1 (gmial -> gmail).
 *
 * Anything else is left alone: false warnings are worse than no warning.
 */
export function suggestEmailDomain(raw: string): EmailSuggestion | null {
  if (!raw || typeof raw !== "string") return null;

  const atIndex = raw.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === raw.length - 1) return null;

  const localPart = raw.slice(0, atIndex);
  const domain = raw.slice(atIndex + 1).toLowerCase().replace(/\.$/, ""); // trailing dot
  if (!domain) return null;

  const fix = (correctedDomain: string): EmailSuggestion => ({
    suggestion: correctedDomain,
    correctedEmail: `${localPart}@${correctedDomain}`,
  });

  // 1. Already correct.
  if (isExactProvider(domain)) return null;

  const labels = domain.split(".");

  // 2. Mistyped TLD: keep everything but the last label, append the real TLD.
  if (labels.length >= 2) {
    const base = labels.slice(0, -1).join(".");
    const tld = labels[labels.length - 1];
    const fixedTld = TLD_TYPOS[tld];
    if (fixedTld && isExactProvider(`${base}.${fixedTld}`)) {
      return fix(`${base}.${fixedTld}`);
    }
  }

  // 3. Doubled suffix: a known provider followed by junk labels.
  if (labels.length > 2) {
    const firstTwo = labels.slice(0, 2).join(".");
    if (isExactProvider(firstTwo)) return fix(firstTwo);
  }

  // 4. Mistyped provider name, same TLD.
  if (labels.length === 2) {
    const [name, tld] = labels;
    for (const provider of PROVIDERS) {
      const [providerName, providerTld] = provider.split(".");
      if (
        tld === providerTld &&
        providerName.length === name.length &&
        distance(name, providerName) <= 1
      ) {
        return fix(provider);
      }
    }
  }

  return null;
}
