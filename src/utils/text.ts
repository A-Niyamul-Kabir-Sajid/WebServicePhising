/**
 * Text utilities for the ticket classifier.
 *
 * Provides amount detection from free-form support messages,
 * supporting English and Bangla digit variants, as well as the
 * "taka / tk / bdt / ৳" currency markers.
 */

/**
 * Normalize Bangla digits to ASCII digits for easier matching.
 * Bengali digits: ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯
 */
function normalizeDigits(input: string): string {
  const map: Record<string, string> = {
    "০": "0",
    "১": "1",
    "২": "2",
    "৩": "3",
    "৪": "4",
    "৫": "5",
    "৬": "6",
    "৭": "7",
    "৮": "8",
    "৯": "9",
  };
  return input.replace(/[০-৯]/g, (d) => map[d] ?? d);
}

/**
 * Try to detect a monetary amount in the message.
 *
 * Detects forms like:
 *   3000 taka | 3000 tk | 3000 bdt | 3000 টাকা
 *   Tk 3000   | BDT 3000  | ৳3000
 *
 * Returns the numeric value if found, otherwise null.
 */
export function detectAmount(message: string): number | null {
  if (!message || typeof message !== "string") return null;

  const normalized = normalizeDigits(message);

  // Patterns:
  // 1) Number followed by taka/tk/bdt/টাকা
  // 2) Tk/BDT/৳ followed by number
  const patterns: RegExp[] = [
    /(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)\s*(taka|tk|bdt|টাকা)/i,
    /(taka|tk|bdt|টাকা)\s*(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)/i,
    /(?:৳|bdt|tk)\s*(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)/i,
    /(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)\s*৳/i,
  ];

  for (const re of patterns) {
    const m = normalized.match(re);
    if (m) {
      // Find the first capture group that is purely numeric
      for (const group of m) {
        if (!group) continue;
        const cleaned = group.replace(/[, ]/g, "");
        if (/^\d+(\.\d+)?$/.test(cleaned)) {
          const n = Number(cleaned);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
    }
  }

  return null;
}

/**
 * Format a detected amount for inclusion in the agent summary.
 * Returns "3000 BDT" or null if the amount is invalid.
 */
export function formatAmountForSummary(amount: number | null): string | null {
  if (amount == null) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${amount} BDT`;
}
