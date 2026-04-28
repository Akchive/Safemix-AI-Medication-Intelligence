import { NextRequest, NextResponse } from "next/server";
import { getAbdmConfig } from "@/lib/abdmConfig";
import { getAdminDb } from "@/lib/firebase/admin";
import { defaultConsentWindowDays } from "@/lib/abdm";

async function getAbdmAccessToken(baseUrl: string, tokenPath: string, tokenField: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${baseUrl.replace(/\/$/, "")}${tokenPath.startsWith("/") ? tokenPath : `/${tokenPath}`}`;
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
    cache: "no-store",
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.[tokenField]) {
    throw new Error(`ABDM auth failed: ${json?.error || resp.statusText}`);
  }
  return String(json[tokenField]);
}

async function sendConsentRequestToAbdm(args: {
  baseUrl: string;
  accessToken: string;
  requestId: string;
  callbackUrl: string;
  purpose: string;
  hiTypes: string[];
  from: string;
  to: string;
  consentRequestPath: string;
}) {
  const consentUrl = `${args.baseUrl.replace(/\/$/, "")}${args.consentRequestPath.startsWith("/") ? args.consentRequestPath : `/${args.consentRequestPath}`}`;
  const resp = await fetch(consentUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.accessToken}`,
      "X-Request-Id": args.requestId,
    },
    body: JSON.stringify({
      requestId: args.requestId,
      callbackUrl: args.callbackUrl,
      purpose: args.purpose,
      hiTypes: args.hiTypes,
      permission: { dateRange: { from: args.from, to: args.to } },
    }),
    cache: "no-store",
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`ABDM consent request failed: ${json?.error || resp.statusText}`);
  }
  return json as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const { uid, purpose, hiTypes, days } = await req.json() as {
      uid: string;
      purpose: "medication_safety" | "doctor_share" | "research_aggregate";
      hiTypes: Array<"Prescription" | "DiagnosticReport" | "DischargeSummary" | "HealthDocumentRecord">;
      days?: number;
    };
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
    if (!purpose || !Array.isArray(hiTypes) || hiTypes.length === 0) {
      return NextResponse.json({ error: "purpose and hiTypes required" }, { status: 400 });
    }

    const cfg = getAbdmConfig();
    const win = defaultConsentWindowDays(days ?? 180);
    const requestId = `abdm_req_${Date.now()}`;

    const payload = {
      requestId,
      uid,
      purpose,
      hiTypes,
      from: win.from,
      to: win.to,
      status: cfg.enabled ? "requested" : "local_requested",
      mode: cfg.mode,
      callbackUrl: cfg.callbackUrl,
      createdAt: Date.now(),
    };

    const db = getAdminDb();
    await db.collection("users").doc(uid).collection("abdm_consents").doc(requestId).set(payload, { merge: true });
    await db.collection("audits").add({ createdAt: Date.now(), action: "abdm_consent_request", uid, requestId, status: payload.status });

    if (!cfg.enabled) {
      await db.collection("users").doc(uid).collection("abdm_consents").doc(requestId).set(
        {
          status: "local_requested",
          gatewayError: "ABDM gateway credentials are not configured yet. Consent request is queued locally.",
          queuedAt: Date.now(),
        },
        { merge: true }
      );
      return NextResponse.json({
        ok: true,
        requestId,
        status: "local_requested",
        mode: cfg.mode,
        warning: "ABDM gateway not configured. Request queued locally.",
      });
    }

    try {
      const accessToken = await getAbdmAccessToken(cfg.baseUrl, cfg.tokenPath, cfg.tokenField, cfg.clientId, cfg.clientSecret);
      const gatewayResp = await sendConsentRequestToAbdm({
        baseUrl: cfg.baseUrl,
        accessToken,
        requestId,
        callbackUrl: cfg.callbackUrl,
        purpose,
        hiTypes,
        from: win.from,
        to: win.to,
        consentRequestPath: cfg.consentRequestPath,
      });

      await db.collection("users").doc(uid).collection("abdm_consents").doc(requestId).set(
        {
          status: "sent_to_gateway",
          gatewayRequestAt: Date.now(),
          gatewayAckId: String(gatewayResp[cfg.consentAckField] ?? gatewayResp.requestId ?? gatewayResp.consentRequestId ?? requestId),
          gatewayPayload: gatewayResp,
        },
        { merge: true }
      );
    } catch (gatewayError) {
      await db.collection("users").doc(uid).collection("abdm_consents").doc(requestId).set(
        {
          status: "gateway_error",
          gatewayError: (gatewayError as Error).message,
          gatewayRequestAt: Date.now(),
        },
        { merge: true }
      );
      throw gatewayError;
    }

    return NextResponse.json({
      ok: true,
      requestId,
      status: "sent_to_gateway",
      mode: cfg.mode,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
