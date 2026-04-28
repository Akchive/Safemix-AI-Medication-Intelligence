import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildFhirMedicationBundle } from "@/lib/fhir";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
    const db = getAdminDb();
    const snap = await db.collection("users").doc(uid).collection("medications").orderBy("addedAt", "desc").limit(200).get();
    const meds = snap.docs.map((d) => d.data()) as any[];
    const bundle = buildFhirMedicationBundle({ uid, medications: meds });
    await db.collection("audits").add({ createdAt: Date.now(), action: "fhir_export_mock", uid, count: meds.length });
    return NextResponse.json({ ok: true, bundle });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

