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

function isHumanReviewRequired(
  caseType: ClassificationResponse["case_type"],
  severity: ClassificationResponse["severity"]
): boolean {
  if (caseType === "phishing_or_social_engineering") return true;
  if (severity === "critical") return true;
  return false;
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

  const ruleResult = sanitizePartial(classifyWithRules(ticket.message));

  let finalPartial = ruleResult;
  if (isGeminiEnabled()) {
    const geminiResult = await classifyWithGemini(ticket);
    if (geminiResult) {
      // Gemini can improve a result, but not downgrade fraud or confident rules.
      if (ruleResult.case_type === "phishing_or_social_engineering") {
        finalPartial = ruleResult;
      } else if (
        geminiResult.case_type === "phishing_or_social_engineering"
      ) {
        finalPartial = geminiResult;
      } else if (
        ruleResult.case_type !== "other" &&
        geminiResult.case_type === "other"
      ) {
        finalPartial = ruleResult;
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
