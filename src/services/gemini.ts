/**
 * Optional Google Gemini integration for the ticket classifier.
 *
 * Gemini is treated as an "improver" on top of the deterministic
 * rule-based classifier. If anything goes wrong (missing key,
 * timeout, invalid JSON, invalid enums, unsafe summary), this
 * module returns null and the caller falls back to the
 * rule-based result.
 */

import { GoogleGenAI } from "@google/genai";

import type {
  PartialClassification,
  TicketInput,
} from "../types/ticket";
import { validateGeminiOutput } from "../utils/validation";
import { sanitizePartial } from "./classifier";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

function readEnvFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function readEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const USE_GEMINI = readEnvFlag("USE_GEMINI", true);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() ?? "";
const GEMINI_MODEL = (process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL);
const GEMINI_TIMEOUT_MS = readEnvNumber(
  "GEMINI_TIMEOUT_MS",
  DEFAULT_TIMEOUT_MS
);

/**
 * Build the prompt sent to Gemini. We ask for strict JSON only,
 * with no markdown, no prose, and no extra fields.
 */
function buildPrompt(ticket: TicketInput): string {
  return [
    "You are a digital finance CRM ticket classifier.",
    "Classify the following customer support ticket.",
    "",
    "Return ONLY a single JSON object with EXACTLY these fields:",
    "  case_type       (one of: wrong_transfer, payment_failed, refund_request, phishing_or_social_engineering, other)",
    "  severity        (one of: low, medium, high, critical)",
    "  department      (one of: customer_support, dispute_resolution, payments_ops, fraud_risk)",
    "  agent_summary   (one or two neutral sentences)",
    "  confidence      (number between 0 and 1)",
    "",
    "Rules:",
    "- Do NOT include any other fields.",
    "- Do NOT include ticket_id or human_review_required.",
    "- Do NOT wrap the JSON in markdown code fences.",
    "- Do NOT add any prose before or after the JSON.",
    "- agent_summary must NEUTRALLY summarize what the customer reported.",
    "- agent_summary must NEVER ask the customer to share OTP, PIN, password, passcode, verification code, CVV, full card number, or card details.",
    "- If the customer reports being asked for OTP / PIN / password / CVV, or a suspicious contact requesting sensitive info, classify as phishing_or_social_engineering with severity = critical and department = fraud_risk.",
    "",
    `Ticket message: ${ticket.message}`,
  ].join("\n");
}

/**
 * Try to extract a JSON object from a model response. The model
 * occasionally wraps JSON in ```json fences or adds stray prose;
 * this helper strips those so we can still parse the payload.
 */
function extractJsonObject(text: string): unknown | null {
  if (!text) return null;

  // Strip markdown code fences if present.
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  // Direct parse first.
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // Fallback: grab the first {...} block.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Decide whether the Gemini enhancement is enabled at all.
 * Returns true only if USE_GEMINI=true AND GEMINI_API_KEY is set.
 */
export function isGeminiEnabled(): boolean {
  return USE_GEMINI && GEMINI_API_KEY.length > 0;
}

/**
 * Run a promise with a timeout. If the promise does not resolve
 * in time, the returned promise rejects with a TimeoutError.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Gemini request timed out"));
    }, ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Try to classify the ticket using Gemini. Returns a sanitized
 * PartialClassification on success, or null on any failure
 * (missing key, timeout, invalid JSON, invalid enums, unsafe summary).
 */
export async function classifyWithGemini(
  ticket: TicketInput
): Promise<PartialClassification | null> {
  if (!isGeminiEnabled()) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = buildPrompt(ticket);

    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      }),
      GEMINI_TIMEOUT_MS
    );

    const text =
      typeof response?.text === "string"
        ? response.text
        : (response as unknown as { text?: string })?.text ?? "";

    const parsed = extractJsonObject(text);
    if (!parsed) return null;

    const validated = validateGeminiOutput(parsed);
    if (!validated) return null;

    return sanitizePartial(validated);
  } catch {
    // Any failure -> null. Caller falls back to rule-based.
    return null;
  }
}