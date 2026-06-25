/**
 * Deterministic rule-based ticket classifier.
 *
 * This is the safety net for the QueueStorm Warmup service:
 *  - It always returns a valid classification.
 *  - It uses a strict priority order so that a single message
 *    can never end up classified into two categories at once.
 *
 * Priority:
 *   1. phishing_or_social_engineering
 *   2. wrong_transfer
 *   3. payment_failed
 *   4. refund_request
 *   5. other
 */

import type {
  CaseType,
  PartialClassification,
} from "../types/ticket";
import { detectAmount, formatAmountForSummary } from "../utils/text";
import { isSafeAgentSummary } from "../utils/safety";

// -----------------------------------------------------------------------------
// Keyword tables. Order does not matter inside a table; the classifier priority
// decides which table wins. We keep English + Bangla variants.
// -----------------------------------------------------------------------------

const PHISHING_KEYWORDS: string[] = [
  "otp",
  "pin",
  "password",
  "passcode",
  "verification code",
  "full card number",
  "card number",
  "cvv",
  "scam",
  "fraud",
  "phishing",
  "suspicious call",
  "someone called",
  "asked my otp",
  "asked for otp",
  "asking otp",
  "asked my pin",
  "asked for pin",
  "verify account",
  "account blocked",
  "click link",
  "login link",
  "fake agent",
  "bkash agent asking",
  "bKash agent asking",
  "ওটিপি",
  "পিন",
  "পাসওয়ার্ড",
  "ভেরিফিকেশন কোড",
  "প্রতারণা",
  "স্ক্যাম",
  "লিংক",
];

const WRONG_TRANSFER_KEYWORDS: string[] = [
  "wrong number",
  "wrong recipient",
  "wrong person",
  "wrong account",
  "mistakenly sent",
  "sent by mistake",
  "money sent wrong",
  "transferred to wrong",
  "sent money to wrong",
  "sent to wrong",
  "to the wrong",
  "ভুল নম্বর",
  "ভুল নাম্বার",
  "ভুল একাউন্ট",
  "ভুল অ্যাকাউন্ট",
  "ভুলে পাঠিয়েছি",
  "ভুল ব্যক্তিকে",
];

const PAYMENT_FAILED_KEYWORDS: string[] = [
  "payment failed",
  "transaction failed",
  "failed payment",
  "failed but balance deducted",
  "balance deducted",
  "money deducted",
  "charged but not successful",
  "payment unsuccessful",
  "merchant did not receive",
  "amount deducted",
  "deducted",
  "টাকা কেটে গেছে",
  "ব্যালেন্স কেটে গেছে",
  "পেমেন্ট হয়নি",
  "ট্রানজেকশন ফেল",
  "টাকা কাটা হয়েছে",
];

const DEDUCTION_HINTS: string[] = [
  "deducted",
  "charged",
  "balance",
  "কেটে গেছে",
  "কাটা হয়েছে",
];

const REFUND_KEYWORDS: string[] = [
  "refund",
  "return my money",
  "money back",
  "cancel transaction",
  "changed my mind",
  "reverse transaction",
  "টাকা ফেরত",
  "রিফান্ড",
  "ফেরত চাই",
  "টাকা ফেরত চাই",
];

const REFUND_DISPUTE_HINTS: string[] = [
  "disputed",
  "unauthorized",
  "merchant refused",
  "duplicate charge",
  "not delivered",
  "wrong charge",
  "service not received",
];

// -----------------------------------------------------------------------------
// Matching helpers
// -----------------------------------------------------------------------------

function containsAny(haystackLower: string, needles: string[]): boolean {
  for (const n of needles) {
    if (haystackLower.includes(n)) return true;
  }
  return false;
}

/**
 * Classify a single support message using deterministic rules.
 *
 * Returns a PartialClassification. The main classifier is responsible
 * for adding ticket_id and human_review_required.
 */
export function classifyWithRules(message: string): PartialClassification {
  const original = typeof message === "string" ? message : "";
  const lower = original.toLowerCase();

  // 1) Phishing / social engineering — always highest priority.
  if (containsAny(lower, PHISHING_KEYWORDS)) {
    return {
      case_type: "phishing_or_social_engineering",
      severity: "critical",
      department: "fraud_risk",
      agent_summary:
        "Customer reports a suspicious contact requesting sensitive account information.",
      confidence: 0.95,
    };
  }

  // 2) Wrong transfer.
  if (containsAny(lower, WRONG_TRANSFER_KEYWORDS)) {
    const amount = detectAmount(original);
    const formatted = formatAmountForSummary(amount);
    const summary = formatted
      ? `Customer reports sending ${formatted} to a wrong recipient and requests recovery support.`
      : "Customer reports sending money to a wrong recipient and requests recovery support.";
    return {
      case_type: "wrong_transfer",
      severity: "high",
      department: "dispute_resolution",
      agent_summary: summary,
      confidence: 0.86,
    };
  }

  // 3) Payment failed.
  if (containsAny(lower, PAYMENT_FAILED_KEYWORDS)) {
    const deducted = containsAny(lower, DEDUCTION_HINTS);
    const severity: "high" | "medium" = deducted ? "high" : "medium";
    return {
      case_type: "payment_failed",
      severity,
      department: "payments_ops",
      agent_summary:
        "Customer reports a failed payment where balance may have been deducted.",
      confidence: deducted ? 0.88 : 0.84,
    };
  }

  // 4) Refund request.
  if (containsAny(lower, REFUND_KEYWORDS)) {
    const isDispute = containsAny(lower, REFUND_DISPUTE_HINTS);
    return {
      case_type: "refund_request",
      severity: isDispute ? "medium" : "low",
      department: isDispute ? "dispute_resolution" : "customer_support",
      agent_summary:
        "Customer requests a refund for a previous transaction.",
      confidence: isDispute ? 0.85 : 0.8,
    };
  }

  // 5) Fallback.
  return {
    case_type: "other",
    severity: "low",
    department: "customer_support",
    agent_summary:
      "Customer reports a general service issue requiring support review.",
    confidence: 0.65,
  };
}

/**
 * Sanity-check a partial classification result and ensure its
 * agent_summary is safe. If unsafe, swap in a neutral summary.
 */
export function sanitizePartial(
  partial: PartialClassification
): PartialClassification {
  if (isSafeAgentSummary(partial.agent_summary)) return partial;
  return {
    ...partial,
    agent_summary:
      "Customer reports an issue requiring support review.",
  };
}

// Re-export for convenience.
export type { CaseType, PartialClassification };
