"use server";
import { getGeminiClient } from "@/lib/ai/client";
import { TASK_MODEL, SAFETY_SETTINGS } from "@/lib/ai/routing";

export interface OcrExtractedData {
  name: string;
  system: string;
  dosage: string;
  frequency: string;
  timing: string;
  withFood: boolean;
  ingredients: string[];
  confidence: "high" | "medium" | "low";
}

export async function extractMedicineData(base64Image: string): Promise<OcrExtractedData> {
  const ai = getGeminiClient();
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

  const response = await ai.models.generateContent({
    model: TASK_MODEL.ocrExtract,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a pharmacist AI. Examine this image of a medicine strip, box, bottle, or prescription label written in any Indian script — Devanagari, Bengali, Tamil, Telugu, Odia, Kannada, Malayalam, Gujarati, Punjabi, Urdu, or Latin.

Extract ALL the following information visible in the image.

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "name": "Primary brand name of the medicine (string)",
  "system": "One of: Allopathic | Ayurvedic | Herbal / Plant-based | OTC | Home Remedy | Supplement | Homeopathic",
  "dosage": "Dosage visible on label e.g. 500mg, 10ml — empty string if not visible",
  "frequency": "One of: Once daily | Twice daily | Three times daily | Every 8 hours | Every 12 hours | As needed — empty string if not visible",
  "timing": "One of: Morning (empty stomach) | Morning (after meal) | Afternoon (after meal) | Evening | Night (before bed) | Night (after meal) — empty string if not visible",
  "withFood": true or false (true if label says 'with food' or 'after meals'),
  "ingredients": ["list", "of", "active", "ingredients", "or", "salts"],
  "confidence": "high | medium | low"
}

Rules:
- If it's a strip of tablets/capsules without brand text, try to read the printed foil text.
- If it's Ayurvedic/herbal by name or ingredients, set system accordingly. Patanjali, Dabur, Himalaya, Baidyanath, Zandu = Ayurvedic by default unless the ingredients clearly say otherwise.
- If dosage info is printed (e.g. '500 mg', 'Take 1 tablet twice a day'), extract it fully.
- Set confidence to 'low' if the image is blurry or text is hard to read.`,
          },
          { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } },
        ],
      },
    ],
    config: {
      safetySettings: SAFETY_SETTINGS,
      temperature: 0.1,
    },
  });

  if (!response.text) throw new Error("No response from Gemini API");

  let clean = response.text.trim();
  if (clean.startsWith("```json")) clean = clean.replace(/^```json/, "").replace(/```$/, "").trim();
  else if (clean.startsWith("```")) clean = clean.replace(/^```/, "").replace(/```$/, "").trim();

  return JSON.parse(clean) as OcrExtractedData;
}
