import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/ai/client";
import { TASK_MODEL, SAFETY_SETTINGS } from "@/lib/ai/routing";
import { LANG_NAME_FOR_PROMPT, type LangCode } from "@/lib/i18n";

const SYSTEM_PROMPT = (langName: string) => `You are SafeMix AI, a high-utility medication safety assistant for Indian patients and caregivers.
You specialize in:
- herb-drug interactions
- AYUSH + allopathic combinations
- timing, spacing, and monitoring advice
- symptom-based caution signals

Respond in ${langName}.
Tone: natural, professional, clear, practical. Do NOT sound robotic.

Output style (always):
1) **Bottom line** (1-2 lines)
2) **Risk level**: Red / Yellow / Green (if any medicine combination is discussed)
3) **Why this risk exists** (mechanism in plain language)
4) **What to do now** (3-5 practical bullets)
5) **What to watch for** (symptoms/signs in short bullets)
6) **Follow-up**: ask one useful follow-up question that would improve accuracy.
6) End with: "This is for awareness, not diagnosis. Talk to a doctor or pharmacist."

Quality rules:
- Be informative and specific; avoid generic motivational lines.
- Be descriptive enough to be useful; avoid half-sentences.
- Never repeat the same greeting/opening across turns.
- Continue from chat context; do not restart from scratch.
- If crucial info is missing, ask max 2 targeted follow-up questions.
- If user mentions emergency signs (fainting, breathing trouble, severe swelling, chest pain, seizures, black stools, persistent vomiting), clearly advise urgent care now.
- Never prescribe a new medicine/dose or claim diagnosis.

SafeMix-first actions:
- suggest "Run AI Safety Check" for exact pair analysis
- suggest "Add Medicine" to keep regimen current
- suggest "Doctor Share" for clinician review
- suggest "Adverse Event Report" if symptoms happened after combination`;

function extractTextFromResponse(response: any): string {
  const parts: string[] = [];
  const candidates = response?.candidates ?? [];
  for (const c of candidates) {
    const p = c?.content?.parts ?? [];
    for (const part of p) {
      if (typeof part?.text === "string" && part.text.trim()) {
        parts.push(part.text.trim());
      }
    }
  }
  if (parts.length > 0) return parts.join("\n\n");
  if (typeof response?.text === "string" && response.text.trim()) return response.text.trim();
  return "";
}

function normalizeReply(reply: string): string {
  let out = reply
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*(Namaste|Hello|Hi)[!,. ]*/i, "")
    .trim();
  // Ensure responses don't end abruptly in the middle of a sentence.
  if (!/[.!?]"?$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}

function looksIncomplete(reply: string): boolean {
  const t = reply.trim();
  if (!t) return true;
  if (t.length < 90) return true;
  if (/(^|\n)\s*\d+\.\s*$/.test(t)) return true; // ends with "1." style fragment
  if (/(^|\n)\s*[-*]\s*$/.test(t)) return true;   // dangling bullet
  if (!/[.!?]"?$/.test(t)) return true;           // no sentence ending
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const { message, language, history } = (await req.json()) as {
      message?: string;
      language?: LangCode;
      history?: Array<{ role: "user" | "assistant"; text: string }>;
    };
    if (!message?.trim()) return NextResponse.json({ reply: "Please ask a question." });

    const lang = (language ?? "en") as LangCode;
    const langName = LANG_NAME_FOR_PROMPT[lang] ?? "English";
    const ai = getGeminiClient();

    const historyBlock = (history ?? [])
      .filter((h) => h?.text?.trim())
      .slice(-8)
      .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
      .join("\n");

    const basePrompt =
`${SYSTEM_PROMPT(langName)}

Conversation so far:
${historyBlock || "(no previous conversation)"}

Latest user question: ${message}

Important formatting:
- Do not use numbered list headings like "1." / "2." at top level.
- Use short titled sections with full sentences.
- Ensure the answer is complete and not cut off.`;

    const response = await ai.models.generateContent({
      model: TASK_MODEL.symptomFollowUp,
      contents: [
        {
          role: "user",
          parts: [{ text: basePrompt }],
        },
      ],
      config: {
        temperature: 0.55,
        topP: 0.9,
        maxOutputTokens: 420,
        safetySettings: SAFETY_SETTINGS,
      },
    });

    let rawReply = extractTextFromResponse(response);
    let reply = normalizeReply(rawReply || "");

    // Auto-retry once if Gemini returns a truncated/fragmented answer.
    if (looksIncomplete(reply)) {
      const retry = await ai.models.generateContent({
        model: TASK_MODEL.symptomFollowUp,
        contents: [
          {
            role: "user",
            parts: [{
              text:
`${basePrompt}

Your previous draft was incomplete/truncated. Rewrite fully now in complete sentences.
Do not stop mid-list. Keep it concise and practical.`
            }],
          },
        ],
        config: {
          temperature: 0.45,
          topP: 0.85,
          maxOutputTokens: 500,
          safetySettings: SAFETY_SETTINGS,
        },
      });
      rawReply = extractTextFromResponse(retry);
      reply = normalizeReply(rawReply || "");
    }

    if (!reply) {
      reply = "I could not complete the answer just now. Please retry once, and if symptoms are present, use Doctor Share for quick review. This is for awareness, not diagnosis. Talk to a doctor or pharmacist.";
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[SafeMix AI Assistant]", err);
    return NextResponse.json(
      { reply: "SafeMix AI is temporarily unavailable. Please retry in a few moments. This is for awareness, not diagnosis. Talk to a doctor or pharmacist." },
      { status: 500 }
    );
  }
}
