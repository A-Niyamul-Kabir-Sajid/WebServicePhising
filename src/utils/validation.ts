import type {
  CaseType,
  Department,
  PartialClassification,
  Severity,
} from "../types/ticket";
import { isSafeAgentSummary } from "./safety";

const MAX_MESSAGE_LENGTH = 4000;

export const ALLOWED_CASE_TYPES: CaseType[] = [
  "wrong_transfer",
  "payment_failed",
  "refund_request",
  "phishing_or_social_engineering",
  "other",
];

export const ALLOWED_SEVERITIES: Severity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const ALLOWED_DEPARTMENTS: Department[] = [
  "customer_support",
  "dispute_resolution",
  "payments_ops",
  "fraud_risk",
];

function isAllowedCaseType(v: unknown): v is CaseType {
  return typeof v === "string" && (ALLOWED_CASE_TYPES as string[]).includes(v);
}

function isAllowedSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (ALLOWED_SEVERITIES as string[]).includes(v);
}

function isAllowedDepartment(v: unknown): v is Department {
  return (
    typeof v === "string" && (ALLOWED_DEPARTMENTS as string[]).includes(v)
  );
}

export function validateGeminiOutput(
  raw: unknown
): PartialClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (!isAllowedCaseType(obj.case_type)) return null;
  if (!isAllowedSeverity(obj.severity)) return null;
  if (!isAllowedDepartment(obj.department)) return null;

  if (typeof obj.agent_summary !== "string") return null;
  const summary = obj.agent_summary.trim();
  if (summary.length === 0) return null;
  if (!isSafeAgentSummary(summary)) return null;

  if (typeof obj.confidence !== "number" && typeof obj.confidence !== "string") {
    return null;
  }
  const confNum =
    typeof obj.confidence === "number"
      ? obj.confidence
      : Number(obj.confidence);
  if (!Number.isFinite(confNum)) return null;
  if (confNum < 0 || confNum > 1) return null;

  return {
    case_type: obj.case_type,
    severity: obj.severity,
    department: obj.department,
    agent_summary: summary,
    confidence: confNum,
  };
}

export function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 100) / 100;
}

export interface RequestValidationOk {
  ok: true;
  ticket_id: string;
  channel: string | undefined;
  locale: string | undefined;
  message: string;
}

export interface RequestValidationErr {
  ok: false;
  status: number;
  error: string;
}

export type RequestValidationResult =
  | RequestValidationOk
  | RequestValidationErr;

export function validateSortTicketRequest(
  body: unknown
): RequestValidationResult {
  if (body === undefined || body === null) {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON body",
    };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid JSON body",
    };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.ticket_id !== "string" || b.ticket_id.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: "ticket_id is required and must be a string",
    };
  }

  if (typeof b.message !== "string" || b.message.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: "message is required and must be a non-empty string",
    };
  }
  if (b.message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: "message must be 4000 characters or fewer",
    };
  }

  const channel =
    typeof b.channel === "string" && b.channel.trim().length > 0
      ? b.channel.trim()
      : undefined;
  const locale =
    typeof b.locale === "string" && b.locale.trim().length > 0
      ? b.locale.trim()
      : undefined;

  return {
    ok: true,
    ticket_id: b.ticket_id.trim(),
    channel,
    locale,
    message: b.message,
  };
}
