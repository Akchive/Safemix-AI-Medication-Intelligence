/**
 * Herb monograph RAG retriever (PRD §14.4).
 *
 * Production: Vertex AI Vector Search over `herbs/{herbId}/monographMarkdown`
 * embedded with `gemini-embedding-001`, queried by the explanation engine to
 * ground its outputs in primary literature. Until that index is provisioned
 * this module ships a small in-memory monograph store keyed by herb name —
 * enough to deliver citation-backed outputs for the demo flow.
 */

export interface HerbMonograph {
  id: string;
  latinName: string;
  commonNames: string[];
  cyp450Profile: string[];
  pharmacodynamicClasses: string[];
  evidenceLevel: "strong" | "moderate" | "limited";
  citations: string[];
  /** Markdown body — short for demo, long in production. */
  body: string;
}

const MONOGRAPHS: HerbMonograph[] = [
  {
    id: "karela",
    latinName: "Momordica charantia",
    commonNames: ["Karela", "Bitter gourd", "Bitter melon"],
    cyp450Profile: [],
    pharmacodynamicClasses: ["hypoglycaemic"],
    evidenceLevel: "moderate",
    citations: ["PMID:21211558", "PMC4027280"],
    body: "Charantin, polypeptide-p, vicine. Mechanism: insulin-mimetic + GLUT4 upregulation. Additive hypoglycaemia with sulfonylureas, metformin, insulin.",
  },
  {
    id: "mulethi",
    latinName: "Glycyrrhiza glabra",
    commonNames: ["Mulethi", "Yashtimadhu", "Licorice"],
    cyp450Profile: ["CYP3A4-inhibitor"],
    pharmacodynamicClasses: ["pseudoaldosteronism"],
    evidenceLevel: "strong",
    citations: ["PMID:22894890", "PvPI:advisory-mulethi-2023"],
    body: "Glycyrrhizin → 11β-HSD2 inhibition → cortisol-mediated MR activation. Hypokalaemia, hypertension; antagonises ACEi/ARBs and potentiates digoxin toxicity.",
  },
  {
    id: "ashwagandha",
    latinName: "Withania somnifera",
    commonNames: ["Ashwagandha", "Indian ginseng"],
    cyp450Profile: [],
    pharmacodynamicClasses: ["sedative", "thyroid-stimulant", "immunomodulator"],
    evidenceLevel: "moderate",
    citations: ["PMID:31975514", "PMID:31060036"],
    body: "Withanolides modulate GABAergic tone. Potentiates benzodiazepines/CNS depressants; can elevate T3/T4 (caution with levothyroxine).",
  },
  {
    id: "guggul",
    latinName: "Commiphora wightii",
    commonNames: ["Guggul"],
    cyp450Profile: ["CYP3A4-inducer"],
    pharmacodynamicClasses: ["lipid-lowering"],
    evidenceLevel: "moderate",
    citations: ["PMID:15642335"],
    body: "Z-guggulsterone is a potent FXR antagonist; CYP3A4 induction lowers serum levels of statins, propranolol, diltiazem, oral contraceptives.",
  },
  {
    id: "triphala",
    latinName: "Terminalia chebula + bellirica + Emblica officinalis",
    commonNames: ["Triphala"],
    cyp450Profile: ["CYP3A4-inhibitor (in vitro)"],
    pharmacodynamicClasses: ["laxative", "chelator"],
    evidenceLevel: "limited",
    citations: ["PMID:32198295"],
    body: "Tannin content chelates Fe, Ca, levothyroxine if co-administered. Space ≥4h from chelatable drugs.",
  },
];

/** Retrieve up to k monographs whose name matches any token in `query`. */
export async function retrieveMonographs(query: string, k = 3): Promise<HerbMonograph[]> {
  const tokens = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const scored = MONOGRAPHS.map((m) => {
    const haystack = [m.id, ...m.commonNames.map((n) => n.toLowerCase())];
    const score = tokens.reduce((s, t) => s + (haystack.some((h) => h.includes(t)) ? 1 : 0), 0);
    return { m, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k).map((s) => s.m);
}

export function getAllMonographs(): HerbMonograph[] {
  return MONOGRAPHS.slice();
}
