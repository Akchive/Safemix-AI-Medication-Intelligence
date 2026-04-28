/**
 * Analytics aggregations for the admin dashboard (PRD §8.4 panels 4 + 5).
 *
 * These run client-side over a sample read from Firestore. In production the
 * same shapes would come from BigQuery via daily Firestore export. Until then
 * we read the latest 1k verdicts + adr_reports and aggregate in memory.
 *
 * k-anonymity: any state with fewer than K_ANON unique users is bucketed into
 * "Other" so the heatmap never identifies a single patient.
 */
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export const K_ANON = 5;

export interface VerdictSample {
  uid?: string;
  verdict: "red" | "yellow" | "green";
  state?: string;
  checkedAt: number;
  source?: "rules" | "ai";
  medicines?: string[];
}

export interface RetentionPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export async function fetchRecentVerdicts(n = 1000): Promise<VerdictSample[]> {
  const out: VerdictSample[] = [];
  // Pull from the global verdicts mirror if present, else from per-user trees.
  try {
    const snap = await getDocs(query(collection(db, "verdicts"), orderBy("checkedAt", "desc"), limit(n)));
    snap.forEach((d) => out.push(d.data() as VerdictSample));
  } catch {
    // mirror not yet populated — fall through with empty sample
  }
  return out;
}

export interface StateBucket { state: string; users: number; redAlerts: number; yellowAlerts: number; total: number }

export function aggregateByState(samples: VerdictSample[]): StateBucket[] {
  const byState = new Map<string, { uids: Set<string>; red: number; yellow: number; total: number }>();
  for (const s of samples) {
    const key = s.state || "Unknown";
    let b = byState.get(key);
    if (!b) {
      b = { uids: new Set(), red: 0, yellow: 0, total: 0 };
      byState.set(key, b);
    }
    if (s.uid) b.uids.add(s.uid);
    if (s.verdict === "red") b.red++;
    else if (s.verdict === "yellow") b.yellow++;
    b.total++;
  }
  const buckets: StateBucket[] = [];
  let othersUsers = 0, othersRed = 0, othersYellow = 0, othersTotal = 0;
  for (const [state, b] of byState) {
    if (b.uids.size < K_ANON) {
      othersUsers += b.uids.size;
      othersRed += b.red;
      othersYellow += b.yellow;
      othersTotal += b.total;
    } else {
      buckets.push({ state, users: b.uids.size, redAlerts: b.red, yellowAlerts: b.yellow, total: b.total });
    }
  }
  if (othersUsers > 0) {
    buckets.push({ state: "Other (k-anonymised)", users: othersUsers, redAlerts: othersRed, yellowAlerts: othersYellow, total: othersTotal });
  }
  return buckets.sort((a, b) => b.total - a.total);
}

/**
 * Sliding DAU/WAU/MAU window from raw verdict samples. We use checkedAt as a
 * proxy-active signal — anyone running an interaction check that day is DAU.
 */
export function computeRetention(samples: VerdictSample[], days = 14): RetentionPoint[] {
  const out: RetentionPoint[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = now - i * 24 * 60 * 60 * 1000;
    const dayStart = dayEnd - 24 * 60 * 60 * 1000;
    const weekStart = dayEnd - 7 * 24 * 60 * 60 * 1000;
    const monthStart = dayEnd - 30 * 24 * 60 * 60 * 1000;

    const dau = new Set<string>(), wau = new Set<string>(), mau = new Set<string>();
    for (const s of samples) {
      const t = s.checkedAt;
      const u = s.uid ?? "anon";
      if (t >= dayStart && t < dayEnd) dau.add(u);
      if (t >= weekStart && t < dayEnd) wau.add(u);
      if (t >= monthStart && t < dayEnd) mau.add(u);
    }
    out.push({
      date: new Date(dayEnd).toISOString().slice(5, 10),
      dau: dau.size,
      wau: wau.size,
      mau: mau.size,
    });
  }
  return out;
}

export interface PairFreq { pair: string; count: number }
export function topPairs(samples: VerdictSample[], n = 10): PairFreq[] {
  const m = new Map<string, number>();
  for (const s of samples) {
    if (!s.medicines || s.medicines.length < 2) continue;
    const key = s.medicines.slice(0, 2).map((x) => x.toLowerCase()).sort().join(" + ");
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count).slice(0, n);
}
