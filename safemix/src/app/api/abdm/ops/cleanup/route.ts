import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

async function requireAdmin(req: NextRequest) {
  const authz = req.headers.get("authorization") ?? "";
  if (!authz.startsWith("Bearer ")) throw new Error("missing bearer token");
  const token = authz.slice("Bearer ".length);
  const decoded = await getAdminAuth().verifyIdToken(token);
  const role = String(decoded.role ?? "");
  if (role !== "admin" && role !== "reviewer") throw new Error("insufficient role");
  return { uid: decoded.uid, role };
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin(req);
    const { olderThanDays = 7 } = (await req.json().catch(() => ({}))) as { olderThanDays?: number };
    const cutoff = Date.now() - Math.max(1, olderThanDays) * 24 * 60 * 60 * 1000;
    const db = getAdminDb();

    let queueUpdated = 0;
    const queuedSnap = await db.collectionGroup("abdm_consents").where("status", "==", "local_requested").get();
    for (const d of queuedSnap.docs) {
      const data = d.data() as any;
      const createdAt = Number(data.createdAt ?? data.queuedAt ?? 0);
      if (createdAt > 0 && createdAt < cutoff) {
        await d.ref.set({ status: "stale_local_requested", staleMarkedAt: Date.now() }, { merge: true });
        queueUpdated += 1;
      }
    }

    let replayDeleted = 0;
    const replaySnap = await db.collection("abdm_callback_replay_guard").get();
    for (const d of replaySnap.docs) {
      const data = d.data() as any;
      const createdAt = Number(data.createdAt ?? 0);
      if (createdAt > 0 && createdAt < cutoff) {
        await d.ref.delete();
        replayDeleted += 1;
      }
    }

    await db.collection("audits").add({
      createdAt: Date.now(),
      action: "abdm_ops_cleanup",
      actorUid: actor.uid,
      actorRole: actor.role,
      olderThanDays,
      queueUpdated,
      replayDeleted,
    });

    return NextResponse.json({ ok: true, olderThanDays, queueUpdated, replayDeleted });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

