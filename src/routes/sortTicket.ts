import { Router, Request, Response } from "express";

import {
  classifyWithRules,
  sanitizePartial,
} from "../services/classifier";
import { classifyWithGemini, isGeminiEnabled } from "../services/gemini";
import type {
  ClassificationResponse,
  TicketInput,
} from "../types/ticket";
import { normalizeConfidence, validateSortTicketRequest } from "../utils/validation";

const router = Router();

/**
 * Decide whether human review is required for a final classification.
 */
function isHumanReviewRequired(
  caseType: ClassificationResponse["case_type"],
  severity: ClassificationResponse["severity"]
): boolean {
  if (caseType === "phishing_or_social_engineering") return true;
  if (severity === "critical") return true;
  return false;
}

/**
 * POST /sort-ticket
 *
 * Body:
 *   { "ticket_id": "T-001", "channel"?: "...", "locale"?: "...", "message": "..." }
 *
 * Returns the exact required schema with no extra fields.
 */
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

  // 1) Deterministic rule-based classification (always runs first).
  const ruleResult = sanitizePartial(classifyWithRules(ticket.message));

  // 2) Optional Gemini refinement.
  let finalPartial = ruleResult;
  if (isGeminiEnabled()) {
    const geminiResult = await classifyWithGemini(ticket);
    if (geminiResult) {
      // For obvious phishing/social engineering cases, the rule-based
      // result is trusted strongly. We never let Gemini downgrade it.
      if (ruleResult.case_type === "phishing_or_social_engineering") {
        finalPartial = ruleResult;
      } else if (
        geminiResult.case_type === "phishing_or_social_engineering"
      ) {
        // Gemini correctly flagged phishing on something the rules missed.
        finalPartial = geminiResult;
      } else {
        finalPartial = geminiResult;
      }
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