function normalizeDigits(input: string): string {
  return input.replace(/[\u09E6-\u09EF]/g, (d) =>
    String(d.charCodeAt(0) - 0x09e6)
  );
}

export function detectAmount(message: string): number | null {
  if (!message || typeof message !== "string") return null;

  const normalized = normalizeDigits(message);

  // Accept amount before or after common currency markers.
  const patterns: RegExp[] = [
    /(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)\s*(taka|tk|bdt|টাকা)/i,
    /(taka|tk|bdt|টাকা)\s*(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)/i,
    /(?:৳|bdt|tk)\s*(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)/i,
    /(\d{1,9}(?:[, ]\d{2,3})*(?:\.\d+)?)\s*৳/i,
  ];

  for (const re of patterns) {
    const m = normalized.match(re);
    if (!m) continue;

    for (const group of m) {
      if (!group) continue;
      const cleaned = group.replace(/[, ]/g, "");
      if (/^\d+(\.\d+)?$/.test(cleaned)) {
        const n = Number(cleaned);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
  }

  return null;
}

export function formatAmountForSummary(amount: number | null): string | null {
  if (amount == null) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${amount} BDT`;
}
