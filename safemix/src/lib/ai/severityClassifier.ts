/**
 * Vertex AI severity classifier — stub (PRD §13.4).
 *
 * The production version posts {drug_a, drug_b, mechanism_class, NTI, CYP450
 * substrate/inhibitor/inducer flags} to a deployed Vertex AI Endpoint and
 * returns calibrated probabilities for {Major, Moderate, Minor, Unknown}. Until
 * we have labelled data and the endpoint provisioned, this module ships a
 * heuristic that mirrors the shape of the future API so callers don't have to
 * change when we swap the implementation.
 */
import { lookupInteraction } from "@/lib/interactionRules";

export type Severity = "Major" | "Moderate" | "Minor" | "Unknown";

export interface SeverityResult {
  label: Severity;
  /** 0–1 calibrated probability */
  probability: number;
  /** Heuristic / endpoint version that produced this label */
  source: "heuristic-v1" | "vertex-ai-v1";
}

const NTI_DRUGS = ["warfarin", "digoxin", "levothyroxine", "phenytoin", "lithium", "carbamazepine", "tacrolimus", "cyclosporine"];
const HIGH_RISK_HERBS = ["mulethi", "yashtimadhu", "licorice", "karela", "bitter gourd", "ashwagandha", "ginkgo", "st john", "guggul"];

export async function classifyNovelPair(args: {
  newDrug: { name: string; system: string };
  existing: string[];
}): Promise<SeverityResult> {
  const endpoint = process.env.VERTEX_SEVERITY_ENDPOINT;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      if (res.ok) {
        const json = await res.json();
        return { ...json, source: "vertex-ai-v1" };
      }
    } catch {
      // fall through to heuristic — never fail the whole pipeline on the classifier
    }
  }

  // Heuristic: rule hit → trust rule. Otherwise, NTI + herb pair = Major,
  // single high-risk herb = Moderate, everything else = Unknown.
  for (const ex of args.existing) {
    const ruleHit = lookupInteraction(args.newDrug.name, [ex]);
    if (ruleHit) {
      const label =
        ruleHit.verdict === "red" ? "Major" :
        ruleHit.verdict === "yellow" ? "Moderate" : "Minor";
      return { label, probability: 0.92, source: "heuristic-v1" };
    }
  }

  const lowerNew = args.newDrug.name.toLowerCase();
  const all = [lowerNew, ...args.existing.map((e) => e.toLowerCase())];
  const hasNTI = all.some((n) => NTI_DRUGS.some((d) => n.includes(d)));
  const hasHerb = all.some((n) => HIGH_RISK_HERBS.some((h) => n.includes(h)));
  if (hasNTI && hasHerb) return { label: "Major", probability: 0.78, source: "heuristic-v1" };
  if (hasHerb) return { label: "Moderate", probability: 0.62, source: "heuristic-v1" };
  return { label: "Unknown", probability: 0.55, source: "heuristic-v1" };
}
