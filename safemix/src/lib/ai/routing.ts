/**
 * Gemini model routing policy (PRD §13.1).
 *
 * Each task picks the cheapest variant that can answer correctly. If a primary
 * call fails or returns low-confidence content, callers may retry with the
 * fallback. Centralising the IDs here means we can flip the whole app to a new
 * generation (e.g. 3.x) by editing one file.
 */
export const GEMINI_MODELS = {
  /** $0.10/M in, $0.40/M out — high volume, low complexity */
  FLASH_LITE: "gemini-2.5-flash-lite",
  /** Default workhorse — balance of cost and quality */
  FLASH: "gemini-2.5-flash",
  /** $1.25/M in, $10/M out — explanations, citations, doctor-grade reasoning */
  PRO: "gemini-2.5-pro",
} as const;

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];

/**
 * Per-task routing table. The interaction engine and assistant import these
 * symbols rather than hard-coding model strings — when we swap a tier, every
 * task that uses that tier follows.
 */
export const TASK_MODEL = {
  nameCorrection:        GEMINI_MODELS.FLASH_LITE,
  voiceIntent:           GEMINI_MODELS.FLASH,
  ocrExtract:            GEMINI_MODELS.FLASH,
  plainExplanation:      GEMINI_MODELS.PRO,
  severityNovelPair:     GEMINI_MODELS.PRO,
  symptomFollowUp:       GEMINI_MODELS.FLASH,
  ragMonograph:          GEMINI_MODELS.PRO,
  doctorClinical:        GEMINI_MODELS.PRO,
} as const;

/**
 * Safety configuration. PRD §13.5 calls for BLOCK_ONLY_HIGH on
 * DANGEROUS_CONTENT — medical content frequently triggers the default
 * BLOCK_MEDIUM and yields refusal-shaped JSON we cannot parse.
 *
 * The @google/genai SDK accepts these as `config.safetySettings`.
 */
import { HarmCategory, HarmBlockThreshold, type SafetySetting } from "@google/genai";

export const SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,         threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

/** Confidence floor below which output is queued for human review (PRD §13.5). */
export const REVIEW_CONFIDENCE_FLOOR = 0.85;
