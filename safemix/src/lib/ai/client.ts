/**
 * Centralised Gemini client factory.
 *
 * Reads the server-only GEMINI_API_KEY (PRD §18) with a fallback to the legacy
 * NEXT_PUBLIC_GEMINI_API_KEY name so existing local setups keep working during
 * migration. Importers must be `"use server"` actions or route handlers — the
 * client must never call this directly, since the key would leak.
 */
// NOTE: this module must only be imported from "use server" actions or route
// handlers. We don't depend on the `server-only` package to keep dependencies
// minimal — every importer is annotated and reviewed.
import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (_client) return _client;

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it to .env.local (server-only, do not prefix with NEXT_PUBLIC_)."
    );
  }
  if (process.env.NEXT_PUBLIC_GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn(
      "[SafeMix] NEXT_PUBLIC_GEMINI_API_KEY is bundled into the client. " +
      "Rename to GEMINI_API_KEY in .env.local to keep it server-only."
    );
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
}
