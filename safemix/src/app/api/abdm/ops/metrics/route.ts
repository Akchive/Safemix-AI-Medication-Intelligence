import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collectionGroup("abdm_consents").get();
    const counts: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const s = String((d.data() as any).status ?? "unknown");
      counts[s] = (counts[s] ?? 0) + 1;
    });

    const now = Date.now();
    const audits = await db.collection("audits").where("createdAt", ">=", now - 24 * 60 * 60 * 1000).get();
    const auditCounts: Record<string, number> = {};
    audits.docs.forEach((d) => {
      const a = String((d.data() as any).action ?? "unknown");
      if (!a.startsWith("abdm_")) return;
      auditCounts[a] = (auditCounts[a] ?? 0) + 1;
    });

    return NextResponse.json({ ok: true, counts, auditCounts24h: auditCounts, total: snap.size });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

