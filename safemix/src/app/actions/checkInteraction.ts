"use server";
import { getGeminiClient } from "@/lib/ai/client";
import { lookupInteraction } from "@/lib/interactionRules";
import { TASK_MODEL, SAFETY_SETTINGS } from "@/lib/ai/routing";
import { maybeQueueForReview } from "@/lib/ai/reviewQueue";
import { LANG_NAME_FOR_PROMPT, type LangCode } from "@/lib/i18n";
import { classifyNovelPair } from "@/lib/ai/severityClassifier";

export interface InteractionResult {
  verdict: "red" | "yellow" | "green";
  medicines: string[];
  reason: string;
  suggestion: string;
  confidence: "high" | "medium" | "low";
  /** "rules" = deterministic DB hit | "ai" = Gemini fallback */
  source?: "rules" | "ai";
  /** PMID / DOI / PvPI / AIIA / monograph URL strings (PRD §9.4 trust layer) */
  citations?: string[];
  /** When set, the verdict is gated on a human reviewer in aiReviewQueue. */
  reviewQueueId?: string | null;
  /** Plain-language explanation in the user's language (PRD §13.1 plainExplanation) */
  plainExplanation?: string;
}

const CONFIDENCE_TO_NUM: Record<string, number> = {
  high: 0.95,
  medium: 0.75,
  low: 0.55,
};

export async function checkInteraction(
  medicineName: string,
  medicineSystem: string,
  existingMedicines: string[],
  language: LangCode = "en"
): Promise<InteractionResult> {

  // ── Stage 1: Deterministic Rule Engine (<50ms) ────────────────────────────
  const ruleResult = lookupInteraction(medicineName, existingMedicines);
  if (ruleResult) return ruleResult;

  // ── Stage 2: Gemini-augmented reasoning ──────────────────────────────────
  const ai = getGeminiClient();
  const langName = LANG_NAME_FOR_PROMPT[language] ?? "English";

  const context =
    existingMedicines.length > 0
      ? `The patient is already taking: ${existingMedicines.join(", ")}.`
      : "The patient is not currently taking any other medicines.";

  // Step A — severity classifier first (faster, cheaper, hard-grounded).
  const severity = await classifyNovelPair({
    newDrug: { name: medicineName, system: medicineSystem },
    existing: existingMedicines,
  });

  const prompt = `You are a clinical pharmacist AI for SafeMix, an Indian medication safety platform.

${context}

The patient now wants to add: "${medicineName}" (${medicineSystem} medicine).
Suspected severity from the SafeMix classifier: ${severity.label} (p=${severity.probability.toFixed(2)}).

Task: Analyse for dangerous drug-drug or drug-herb interactions between the new medicine and the existing ones, or assess safety if no existing medicines. Consider Indian polypharmacy context including allopathic, ayurvedic, herbal, and home remedies.

Respond ONLY with a valid JSON object — no markdown, no explanation outside JSON:
{
  "verdict": "red" | "yellow" | "green",
  "medicines": ["list of medicines involved in the primary interaction — include the new medicine"],
  "reason": "1-2 sentence clinical explanation of WHY this combination is risky or safe (English).",
  "suggestion": "1-2 sentence specific, actionable advice for the patient (English).",
  "confidence": "high" | "medium" | "low",
  "citations": ["At least 1 reference (PMID:xxxxx, DOI:..., or PvPI/AIIA URL). Use empty array only if you cannot cite anything."],
  "plainExplanation": "Same explanation as 'reason' but in ${langName}, warm tone, max 80 words, end with: 'This is awareness, not diagnosis. Talk to a doctor or pharmacist.'"
}

Verdict rules:
- "red" = Severe risk, do not combine without doctor supervision.
- "yellow" = Use with caution, monitor carefully, timing matters.
- "green" = Generally safe or no known significant interaction.
`;

  const response = await ai.models.generateContent({
    model: TASK_MODEL.severityNovelPair,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      safetySettings: SAFETY_SETTINGS,
      temperature: 0.3,
    },
  });

  if (!response.text) throw new Error("No response from Gemini.");

  let cleanJson = response.text.trim();
  if (cleanJson.startsWith("```json")) cleanJson = cleanJson.replace(/^```json/, "").replace(/```$/, "").trim();
  else if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(cleanJson) as InteractionResult;

  if (!parsed.medicines.some((m) =>
    m.toLowerCase().includes(medicineName.toLowerCase().split(" ")[0])
  )) {
    parsed.medicines = [medicineName, ...parsed.medicines];
  }

  if (!parsed.citations || parsed.citations.length === 0) {
    parsed.citations = ["SafeMix internal monograph (no external citation found)"];
  }

  // Gate low-confidence outputs through the review queue.
  const numericConfidence = CONFIDENCE_TO_NUM[parsed.confidence] ?? 0.55;
  const reviewQueueId = await maybeQueueForReview({
    inputPayload: { medicineName, medicineSystem, existingMedicines, language },
    geminiResponseRaw: response.text,
    modelUsed: TASK_MODEL.severityNovelPair,
    confidence: numericConfidence,
    safetyFlags: [],
  });

  return { ...parsed, source: "ai", reviewQueueId };
}
