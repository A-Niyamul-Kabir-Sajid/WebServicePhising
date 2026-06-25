/**
 * Type definitions for the QueueStorm Warmup ticket classification API.
 */

export type CaseType =
  | "wrong_transfer"
  | "payment_failed"
  | "refund_request"
  | "phishing_or_social_engineering"
  | "other";

export type Severity = "low" | "medium" | "high" | "critical";

export type Department =
  | "customer_support"
  | "dispute_resolution"
  | "payments_ops"
  | "fraud_risk";

export type Channel = "app" | "sms" | "call_center" | "merchant_portal";
export type Locale = "bn" | "en" | "mixed";

export interface TicketInput {
  ticket_id: string;
  channel?: Channel | string;
  locale?: Locale | string;
  message: string;
}

/**
 * A partial classification result returned by a classifier
 * (either the rule-based one or Gemini). The main classifier
 * is responsible for adding ticket_id and human_review_required.
 */
export interface PartialClassification {
  case_type: CaseType;
  severity: Severity;
  department: Department;
  agent_summary: string;
  confidence: number;
}

/**
 * The final, normalized response returned by /sort-ticket.
 */
export interface ClassificationResponse {
  ticket_id: string;
  case_type: CaseType;
  severity: Severity;
  department: Department;
  agent_summary: string;
  human_review_required: boolean;
  confidence: number;
}
