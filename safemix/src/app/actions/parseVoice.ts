"use server";
import { getGeminiClient } from "@/lib/ai/client";
import { TASK_MODEL, SAFETY_SETTINGS } from "@/lib/ai/routing";

export interface ParsedMedicineFields {
  name: string;
  system: string;
  dosage: string;
  frequency: string;
  timing: string;
  withFood: boolean;
  startDate: string;
  confidence: "high" | "medium" | "low";
}

const today = new Date().toISOString().split("T")[0];

const SCHEMA_PROMPT = `
Return ONLY a valid JSON object — no markdown, no explanation:
{
  "name": "Brand name of the medicine (string, required)",
  "system": "One of: Allopathic | Ayurvedic | Herbal / Plant-based | OTC | Home Remedy | Supplement | Homeopathic",
  "dosage": "e.g. 500mg, 2 tablets, 10ml — empty string if unknown",
  "frequency": "One of: Once daily | Twice daily | Three times daily | Every 8 hours | Every 12 hours | As needed — empty string if unknown",
  "timing": "One of: Morning (empty stomach) | Morning (after meal) | Afternoon (after meal) | Evening | Night (before bed) | Night (after meal) — empty string if unknown",
  "withFood": true or false (boolean — true if taken with food or after meal),
  "startDate": "ISO date YYYY-MM-DD if mentioned, else empty string",
  "confidence": "high | medium | low"
}
`;

export async function parseVoiceInput(transcript: string): Promise<ParsedMedicineFields> {
  const ai = getGeminiClient();

  const prompt = `You are a clinical pharmacist AI. Today's date is ${today}.

A patient described their medicine verbally in natural language (may be English, Hindi, Bengali, Tamil, Telugu, Odia, or mixed). Extract structured data from this description:

"${transcript}"

${SCHEMA_PROMPT}

Rules:
- If the person says "subah" (morning), "din mein" (during the day), "raat" (night) — map to appropriate timing.
- If they say "khane ke baad" or "after food/meal" → timing should include "after meal", withFood = true.
- If they say "khali pet" or "empty stomach" → timing "empty stomach", withFood = false.
- Common Indian prefixes/brand names: Metformin, Lisinopril, Ashwagandha, Karela, Pantoprazole, Crocin, Combiflam, etc.
- If the medicine is clearly Ayurvedic/herbal, set system accordingly.
`;

  const response = await ai.models.generateContent({
    model: TASK_MODEL.voiceIntent,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      safetySettings: SAFETY_SETTINGS,
      temperature: 0.2,
    },
  });

  if (!response.text) throw new Error("No response from Gemini.");

  let clean = response.text.trim();
  if (clean.startsWith("```json")) clean = clean.replace(/^```json/, "").replace(/```$/, "").trim();
  else if (clean.startsWith("```")) clean = clean.replace(/^```/, "").replace(/```$/, "").trim();

  return JSON.parse(clean) as ParsedMedicineFields;
}
