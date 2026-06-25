/**
 * Safety utilities for the agent_summary field.
 *
 * The agent_summary must NEVER instruct or encourage the customer
 * to share sensitive information such as PIN, OTP, password,
 * passcode, verification code, CVV, full card number, or card details.
 */

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

/**
 * Returns true if the provided agent summary is safe to include
 * in the API response. A summary is considered unsafe if it
 * instructs (in any case) the customer to share or send any
 * sensitive piece of information.
 */
export function isSafeAgentSummary(summary: string): boolean {
  if (!summary || typeof summary !== "string") return false;

  const lower = summary.toLowerCase();

  for (const phrase of UNSAFE_PHRASES) {
    if (lower.includes(phrase)) return false;
  }

  // Belt-and-braces: also detect any "ask ... for otp/pin/password"
  // variants we might have missed, even with light punctuation.
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
