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

    const response = await ai.models.generateContent({
      model: TASK_MODEL.symptomFollowUp,
      contents: [
        {
          role: "user",
          parts: [{
            text:
`${SYSTEM_PROMPT(langName)}

Conversation so far:
${historyBlock || "(no previous conversation)"}

Latest user question: ${message}
`
          }],
        },
      ],
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 420,
        safetySettings: SAFETY_SETTINGS,
      },
    });

    const rawReply = extractTextFromResponse(response)
      || "I couldn't generate a response. Please try again.";
    const reply = normalizeReply(rawReply);

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[SafeMix AI Assistant]", err);
    return NextResponse.json(
      { reply: "SafeMix AI is temporarily unavailable. Please retry in a few moments. This is for awareness, not diagnosis. Talk to a doctor or pharmacist." },
      { status: 500 }
    );
  }
}
