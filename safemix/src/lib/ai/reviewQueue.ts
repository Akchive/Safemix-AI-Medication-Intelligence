/**
 * AI Review Queue (PRD §8.3 module 5, §13.5).
 *
 * Any Gemini output with self-judged confidence below REVIEW_CONFIDENCE_FLOOR
 * — or that the safety filter flagged — is written to `aiReviewQueue/{id}` in
 * Firestore for a human reviewer (BAMS + MD pharmacology) to approve, edit, or
 * reject before it reaches the user. We *also* write a stable responseId on
 * every Gemini output so red-team replays can find the exact prompt.
 */
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { REVIEW_CONFIDENCE_FLOOR } from "@/lib/ai/routing";

export type ReviewQueueState = "pending" | "approved" | "edited" | "rejected" | "escalated";

export interface ReviewQueueEntry {
  inputPayload: Record<string, unknown>;
  geminiResponseRaw: string;
  modelUsed: string;
  confidence: number;
  safetyFlags: string[];
  state: ReviewQueueState;
  slaDeadline: number;
  /** epoch ms */
  createdAt: number;
  /** Reviewer custom-claim uid once assigned */
  assignedTo?: string;
  decisionNotes?: string;
}

const SLA_HOURS = 6;

/**
 * Decide whether a Gemini response should be queued. The caller passes the
 * model's self-judged confidence (0–1) and any safety filter labels.
 * Returns the queue document id when queued, or null when the output passed.
 */
export async function maybeQueueForReview(args: {
  inputPayload: Record<string, unknown>;
  geminiResponseRaw: string;
  modelUsed: string;
  confidence: number;
  safetyFlags?: string[];
}): Promise<string | null> {
  const flags = args.safetyFlags ?? [];
  const lowConfidence = args.confidence < REVIEW_CONFIDENCE_FLOOR;
  const flagged = flags.length > 0;
  if (!lowConfidence && !flagged) return null;

  try {
    const ref = await addDoc(collection(db, "aiReviewQueue"), {
      ...args,
      safetyFlags: flags,
      state: "pending",
      createdAt: Date.now(),
      slaDeadline: Date.now() + SLA_HOURS * 60 * 60 * 1000,
    } satisfies ReviewQueueEntry);
    return ref.id;
  } catch (err) {
    console.error("[SafeMix] failed to write aiReviewQueue entry:", err);
    return null;
  }
}
