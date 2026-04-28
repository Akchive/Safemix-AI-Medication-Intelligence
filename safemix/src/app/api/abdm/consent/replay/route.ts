import { NextRequest, NextResponse } from "next/server";
import { getAbdmConfig } from "@/lib/abdmConfig";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

async function requireAdmin(req: NextRequest) {
  const authz = req.headers.get("authorization") ?? "";
  if (!authz.startsWith("Bearer ")) throw new Error("missing bearer token");
  const token = authz.slice("Bearer ".length);
  const decoded = await getAdminAuth().verifyIdToken(token);
  const role = String(decoded.role ?? "");
  if (role !== "admin" && role !== "reviewer") throw new Error("insufficient role");
}

async function getAccessToken(baseUrl: string, tokenPath: string, tokenField: string, clientId: string, clientSecret: string) {
  const url = `${baseUrl.replace(/\/$/, "")}${tokenPath.startsWith("/") ? tokenPath : `/${tokenPath}`}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.[tokenField]) throw new Error(`auth failed: ${j?.error || r.statusText}`);
  return String(j[tokenField]);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const cfg = getAbdmConfig();
    if (!cfg.enabled) return NextResponse.json({ error: "ABDM gateway not configured" }, { status: 400 });

    const db = getAdminDb();
    const queuedSnap = await db.collectionGroup("abdm_consents").where("status", "==", "local_requested").limit(50).get();
    if (queuedSnap.empty) return NextResponse.json({ ok: true, total: 0, success: 0, failed: 0 });

    const accessToken = await getAccessToken(cfg.baseUrl, cfg.tokenPath, cfg.tokenField, cfg.clientId, cfg.clientSecret);

    let success = 0;
    let failed = 0;
    const results: Array<{ requestId: string; ok: boolean; error?: string }> = [];

    for (const d of queuedSnap.docs) {
      const rec = d.data() as any;
      const requestId = String(rec.requestId ?? d.id);
      const consentUrl = `${cfg.baseUrl.replace(/\/$/, "")}${cfg.consentRequestPath.startsWith("/") ? cfg.consentRequestPath : `/${cfg.consentRequestPath}`}`;
      try {
        const resp = await fetch(consentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "X-Request-Id": requestId,
          },
          body: JSON.stringify({
            requestId,
            callbackUrl: cfg.callbackUrl,
            purpose: rec.purpose,
            hiTypes: rec.hiTypes,
            permission: { dateRange: { from: rec.from, to: rec.to } },
          }),
          cache: "no-store",
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.error || resp.statusText);
        await d.ref.set(
          {
            status: "sent_to_gateway",
            replayedAt: Date.now(),
            gatewayAckId: String(json?.[cfg.consentAckField] ?? json?.requestId ?? requestId),
            gatewayPayload: json,
          },
          { merge: true }
        );
        success += 1;
        results.push({ requestId, ok: true });
      } catch (e) {
        failed += 1;
        await d.ref.set({ status: "gateway_error", gatewayError: (e as Error).message, replayedAt: Date.now() }, { merge: true });
        results.push({ requestId, ok: false, error: (e as Error).message });
      }
    }

    await db.collection("audits").add({ createdAt: Date.now(), action: "abdm_consent_replay", total: queuedSnap.size, success, failed });
    return NextResponse.json({ ok: true, total: queuedSnap.size, success, failed, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
