import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/ai/client";
import { TASK_MODEL, SAFETY_SETTINGS } from "@/lib/ai/routing";
import { LANG_NAME_FOR_PROMPT, type LangCode } from "@/lib/i18n";

const SYSTEM_PROMPT = (langName: string) => `You are SafeMix AI, a helpful medication safety assistant for Indian patients.
You answer questions about herb-drug interactions, AYUSH medicines, timing of doses, and general medication safety.
You speak warmly and clearly. You cover both Ayurvedic and allopathic medicines, and you understand Indian brands.
Respond in ${langName}.
Always end your response with a brief reminder that this is for awareness, not diagnosis.
Keep responses concise — 60 to 120 words. Use simple language. Never recommend or prescribe.`;

export async function POST(req: NextRequest) {
  try {
    const { message, language } = (await req.json()) as { message?: string; language?: LangCode };
    if (!message?.trim()) return NextResponse.json({ reply: "Please ask a question." });

    const lang = (language ?? "en") as LangCode;
    const langName = LANG_NAME_FOR_PROMPT[lang] ?? "English";
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: TASK_MODEL.symptomFollowUp,
      contents: [
        { role: "user", parts: [{ text: `${SYSTEM_PROMPT(langName)}\n\nUser question: ${message}` }] },
      ],
      config: {
        temperature: 0.4,
        maxOutputTokens: 300,
        safetySettings: SAFETY_SETTINGS,
      },
    });

    const reply = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
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
