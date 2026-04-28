import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });

const SYSTEM_PROMPT = `You are SafeMix AI, a helpful medication safety assistant for Indian patients.
You answer questions about herb-drug interactions, AYUSH medicines, timing of doses, and general medication safety.
You speak warmly and clearly. You cover both Ayurvedic and allopathic medicines, and you understand Indian brands.
You always end your response with a brief reminder that this is for awareness, not diagnosis.
Keep responses concise — 60 to 120 words. Use simple language. Never recommend or prescribe.`;

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ reply: "Please ask a question." });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nUser question: ${message}` }] },
      ],
      config: {
        temperature: 0.4,
        maxOutputTokens: 200,
      },
    });

    const reply = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || "I couldn't generate a response. Please try again.";

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("[SafeMix AI Assistant]", err);
    return NextResponse.json({ reply: "Service temporarily unavailable. Please try again shortly." }, { status: 500 });
  }
}
