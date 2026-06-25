import { Router, Request, Response } from "express";

import {
  classifyWithRules,
  matchKeywords,
  sanitizePartial,
} from "../services/classifier";
import { classifyWithGemini, isGeminiEnabled } from "../services/gemini";
import type {
  CaseType,
  ClassificationResponse,
  PartialClassification,
  TicketInput,
} from "../types/ticket";
import { normalizeConfidence, validateSortTicketRequest } from "../utils/validation";

const router = Router();

function isHumanReviewRequired(
  caseType: ClassificationResponse["case_type"],
  severity: ClassificationResponse["severity"]
): boolean {
  if (caseType === "phishing_or_social_engineering") return true;
  if (severity === "critical") return true;
  return false;
}

function isCriticalFraud(p: PartialClassification): boolean {
  return (
    p.case_type === "phishing_or_social_engineering" && p.severity === "critical"
  );
}

// Build a stable severity/department/summary for a case type that was derived
// from keyword matching alone (no Gemini path). We seed the rule pipeline
// with the corrected text so amounts and summaries stay grounded.
function buildFromKeyword(
  caseType: CaseType,
  sourceMessage: string
): PartialClassification {
  const seeded = injectCaseTypeHint(sourceMessage, caseType);
  return sanitizePartial(classifyWithRules(seeded));
}

// Make sure the rule pipeline routes to the desired case_type when we already
// decided it from keywords. We append a hint phrase only when the natural
// text would not otherwise trigger that case_type.
function injectCaseTypeHint(text: string, caseType: CaseType): string {
  const hintByCase: Record<CaseType, string> = {
    phishing_or_social_engineering: "otp",
    wrong_transfer: "wrong number",
    payment_failed: "payment failed",
    refund_request: "refund",
    other: "",
  };
  const hint = hintByCase[caseType];
  if (!hint) return text;
  return `${text} ${hint}`;
}

router.post("/sort-ticket", async (req: Request, res: Response) => {
  const validation = validateSortTicketRequest(req.body);
  if (!validation.ok) {
    res.status(validation.status).json({ error: validation.error });
    return;
  }

  const ticket: TicketInput = {
    ticket_id: validation.ticket_id,
    channel: validation.channel,
    locale: validation.locale,
    message: validation.message,
  };

  // 1. Deterministic rule-based classification on the raw message.
  const ruleResult = sanitizePartial(classifyWithRules(ticket.message));

  // 2. Optional Gemini pass: cleans up the sentence and classifies.
  let geminiResult:
    | (PartialClassification & { corrected_message?: string })
    | null = null;
  let correctedMessage: string | null = null;
  if (isGeminiEnabled()) {
    geminiResult = await classifyWithGemini(ticket);
    if (geminiResult?.corrected_message) {
      correctedMessage = geminiResult.corrected_message;
    }
  }

  // 3. Keyword match against the corrected message (falls back to the raw
  //    message if Gemini is disabled or did not return a correction).
  const keywordText = (correctedMessage || ticket.message || "").toLowerCase();
  const keywordCaseType = matchKeywords(keywordText);

  // 4. Merge: phishing/fraud keywords always win; confident rule matches hold;
  //    keyword-derived case types upgrade "other" results; otherwise trust Gemini.
  let finalPartial: PartialClassification = ruleResult;

  if (keywordCaseType === "phishing_or_social_engineering") {
    finalPartial = buildFromKeyword(
      "phishing_or_social_engineering",
      correctedMessage || ticket.message
    );
  } else if (
    geminiResult &&
    isCriticalFraud(geminiResult) &&
    ruleResult.case_type !== "phishing_or_social_engineering"
  ) {
    finalPartial = geminiResult;
  } else if (ruleResult.case_type === "phishing_or_social_engineering") {
    finalPartial = ruleResult;
  } else if (
    keywordCaseType &&
    ruleResult.case_type === "other" &&
    (!geminiResult || geminiResult.case_type === "other")
  ) {
    finalPartial = buildFromKeyword(
      keywordCaseType,
      correctedMessage || ticket.message
    );
  } else if (
    keywordCaseType &&
    geminiResult &&
    keywordCaseType !== geminiResult.case_type &&
    geminiResult.case_type === "other"
  ) {
    finalPartial = buildFromKeyword(
      keywordCaseType,
      correctedMessage || ticket.message
    );
  } else if (geminiResult) {
    if (
      ruleResult.case_type !== "other" &&
      geminiResult.case_type === "other"
    ) {
      finalPartial = ruleResult;
    } else {
      finalPartial = geminiResult;
    }
  }

  const response: ClassificationResponse = {
    ticket_id: ticket.ticket_id,
    case_type: finalPartial.case_type,
    severity: finalPartial.severity,
    department: finalPartial.department,
    agent_summary: finalPartial.agent_summary,
    human_review_required: isHumanReviewRequired(
      finalPartial.case_type,
      finalPartial.severity
    ),
    confidence: normalizeConfidence(finalPartial.confidence),
  };

  res.status(200).json(response);
});

export default router;
