const UNSAFE_PHRASES: string[] = [
  "share your otp",
  "provide otp",
  "send otp",
  "give otp",
  "share pin",
  "provide pin",
  "give pin",
  "provide password",
  "share password",
  "send password",
  "provide cvv",
  "share cvv",
  "full card number",
  "card details",
  "verification code",
  "share your pin",
  "share your password",
  "share your cvv",
  "send your otp",
  "send your pin",
  "send your password",
  "ask the user for password",
  "ask the user for pin",
  "ask the user for otp",
  "customer should share pin",
  "customer should share otp",
  "customer should share password",
];

export function isSafeAgentSummary(summary: string): boolean {
  if (!summary || typeof summary !== "string") return false;

  const lower = summary.toLowerCase();

  for (const phrase of UNSAFE_PHRASES) {
    if (lower.includes(phrase)) return false;
  }

  // Catch unsafe phrasing variants not covered by the exact phrase list.
  if (
    /\bask\b[^.]*\b(otp|pin|password|passcode|cvv)\b/i.test(summary)
  ) {
    return false;
  }
  if (
    /\b(please|kindly|share|provide|give|send)\b[^.]*\b(otp|pin|password|passcode|cvv|verification code)\b/i.test(
      summary
    )
  ) {
    return false;
  }

  return true;
}
