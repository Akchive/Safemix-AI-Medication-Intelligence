import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/ai/client";
import { TASK_MODEL, SAFETY_SETTINGS } from "@/lib/ai/routing";
import { LANG_NAME_FOR_PROMPT, type LangCode } from "@/lib/i18n";

const SYSTEM_PROMPT = (langName: string) => `You are SafeMix AI, a helpful medication safety assistant for Indian patients.
You answer questions about herb-drug interactions, AYUSH medicines, timing of doses, and general medication safety.
You speak warmly and clearly. You cover both Ayurvedic and allopathic medicines, and you understand Indian brands.
Respond in ${langName}.
Always end your response with a brief reminder that this is for awareness, not diagnosis.
Keep responses concise but complete — 90 to 160 words.
Structure:
1) Direct answer
2) Why it matters (1 sentence)
3) What to do now (2-3 bullets max)
Never start every answer with the same greeting. Vary openings naturally.
Do not repeat the same sentence across turns.
If user asks a follow-up, directly continue from previous context.
Never prescribe, diagnose, or give unsafe dosing advice.`;

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

    const reply = extractTextFromResponse(response)
      || "I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[SafeMix AI Assistant]", err);
    return NextResponse.json(
      { reply: "Service temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }
}
