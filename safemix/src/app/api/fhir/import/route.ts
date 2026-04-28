import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { parseFhirBundleToRegimen } from "@/lib/fhir";

export async function POST(req: NextRequest) {
  try {
    const { uid, bundle } = (await req.json()) as { uid: string; bundle: any };
    if (!uid || !bundle) return NextResponse.json({ error: "uid and bundle required" }, { status: 400 });
    const meds = parseFhirBundleToRegimen(bundle);
    const db = getAdminDb();
    const batch = db.batch();
    for (const m of meds) {
      batch.set(db.collection("users").doc(uid).collection("medications").doc(m.id), { ...m, syncedAt: Date.now(), importedFrom: "FHIR_MOCK" }, { merge: true });
    }
    await batch.commit();
    await db.collection("audits").add({ createdAt: Date.now(), action: "fhir_import_mock", uid, count: meds.length });
    return NextResponse.json({ ok: true, imported: meds.length, medications: meds });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

