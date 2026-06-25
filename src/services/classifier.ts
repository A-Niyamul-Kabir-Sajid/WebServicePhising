import type {
  CaseType,
  PartialClassification,
} from "../types/ticket";
import { detectAmount, formatAmountForSummary } from "../utils/text";
import { isSafeAgentSummary } from "../utils/safety";

export const PHISHING_KEYWORDS: string[] = [
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

export const WRONG_TRANSFER_KEYWORDS: string[] = [
  "wrong number",
  "wrong numbet",
  "wrong nubmer",
  "wrong numbr",
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

export const PAYMENT_FAILED_KEYWORDS: string[] = [
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

export const DEDUCTION_HINTS: string[] = [
  "deducted",
  "charged",
  "balance",
  "কেটে গেছে",
  "কাটা হয়েছে",
];

export const REFUND_KEYWORDS: string[] = [
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

export const REFUND_DISPUTE_HINTS: string[] = [
  "disputed",
  "unauthorized",
  "merchant refused",
  "duplicate charge",
  "not delivered",
  "wrong charge",
  "service not received",
];

export type KeywordSet = {
  case_type: CaseType;
  keywords: string[];
};

export const KEYWORD_SETS: KeywordSet[] = [
  { case_type: "phishing_or_social_engineering", keywords: PHISHING_KEYWORDS },
  { case_type: "wrong_transfer", keywords: WRONG_TRANSFER_KEYWORDS },
  { case_type: "payment_failed", keywords: PAYMENT_FAILED_KEYWORDS },
  { case_type: "refund_request", keywords: REFUND_KEYWORDS },
];

function containsAny(haystackLower: string, needles: string[]): boolean {
  for (const n of needles) {
    if (haystackLower.includes(n)) return true;
  }
  return false;
}

function tokenizeEnglish(textLower: string): string[] {
  return textLower
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function boundedEditDistance(
  a: string,
  b: string,
  maxDistance: number
): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function hasNearToken(
  tokens: string[],
  targets: string[],
  maxDistance: number
): boolean {
  return tokens.some((token) =>
    targets.some(
      (target) =>
        token === target ||
        boundedEditDistance(token, target, maxDistance) <= maxDistance
    )
  );
}

// Keeps the fallback useful when Gemini is unavailable and users make typos.
function hasWrongTransferTypoPattern(textLower: string): boolean {
  const tokens = tokenizeEnglish(textLower);
  if (!tokens.includes("wrong")) return false;

  const hasRecipientWord = hasNearToken(
    tokens,
    ["number", "recipient", "account", "person"],
    2
  );
  if (!hasRecipientWord) return false;

  const hasTransferContext =
    hasNearToken(tokens, ["sent", "send", "transfer", "transferred"], 1) ||
    containsAny(textLower, ["money", "taka", "tk", "bdt"]) ||
    /\b\d{2,}\b/.test(textLower);

  return hasTransferContext;
}

export function matchKeywords(text: string): CaseType | null {
  const lower = (text || "").toLowerCase();
  if (!lower) return null;

  // Priority order: phishing first, then wrong_transfer, payment_failed, refund.
  for (const set of KEYWORD_SETS) {
    if (containsAny(lower, set.keywords)) {
      return set.case_type;
    }
  }
  return null;
}

export function classifyWithRules(message: string): PartialClassification {
  const original = typeof message === "string" ? message : "";
  const lower = original.toLowerCase();

  // Fraud signals stay first so they cannot be masked by transfer/refund wording.
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

  if (
    containsAny(lower, WRONG_TRANSFER_KEYWORDS) ||
    hasWrongTransferTypoPattern(lower)
  ) {
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

  return {
    case_type: "other",
    severity: "low",
    department: "customer_support",
    agent_summary:
      "Customer reports a general service issue requiring support review.",
    confidence: 0.65,
  };
}

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

export type { CaseType, PartialClassification };
