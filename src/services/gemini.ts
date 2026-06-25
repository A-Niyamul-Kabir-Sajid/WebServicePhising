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

function extractJsonObject(text: string): unknown | null {
  if (!text) return null;

  // Accept common model drift: code fences or prose around the JSON object.
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
  }

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

export function isGeminiEnabled(): boolean {
  return USE_GEMINI && GEMINI_API_KEY.length > 0;
}

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
    // Keep Gemini optional; the route falls back to rules on any failure.
    return null;
  }
}
