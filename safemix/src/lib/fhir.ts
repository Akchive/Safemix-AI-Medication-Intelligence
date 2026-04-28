import type { RegimenMedicine } from "@/lib/regimen";

type FhirResource = Record<string, any>;

export function parseFhirBundleToRegimen(bundle: any): RegimenMedicine[] {
  const entries: FhirResource[] = Array.isArray(bundle?.entry) ? bundle.entry.map((e: any) => e?.resource).filter(Boolean) : [];
  const meds: RegimenMedicine[] = [];
  const now = Date.now();

  for (const r of entries) {
    const rt = String(r?.resourceType ?? "");
    if (rt !== "MedicationRequest" && rt !== "MedicationStatement") continue;
    const medName =
      r?.medicationCodeableConcept?.text ||
      r?.medicationCodeableConcept?.coding?.[0]?.display ||
      r?.medicationReference?.display ||
      "Unknown medicine";
    const dosageInst = r?.dosageInstruction?.[0];
    const doseText = dosageInst?.text || dosageInst?.doseAndRate?.[0]?.doseQuantity?.value;
    const timingCode = dosageInst?.timing?.code?.text || dosageInst?.timing?.repeat?.when?.[0] || "";
    const authoredOn = r?.authoredOn || r?.effectiveDateTime || new Date().toISOString().slice(0, 10);
    meds.push({
      id: `fhir_${now}_${meds.length}`,
      name: String(medName),
      system: "Allopathic",
      dosage: doseText ? String(doseText) : "",
      frequency: "",
      timing: timingCode ? String(timingCode) : "",
      withFood: true,
      startDate: String(authoredOn).slice(0, 10),
      addedAt: now + meds.length,
    });
  }

  return meds;
}

export function buildFhirMedicationBundle(args: { uid: string; medications: RegimenMedicine[]; generatedAt?: number }) {
  const ts = args.generatedAt ?? Date.now();
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date(ts).toISOString(),
    entry: args.medications.map((m, idx) => ({
      fullUrl: `urn:uuid:${args.uid}-med-${idx + 1}`,
      resource: {
        resourceType: "MedicationStatement",
        status: "active",
        medicationCodeableConcept: { text: m.name },
        effectiveDateTime: m.startDate || new Date(m.addedAt).toISOString().slice(0, 10),
        note: [{ text: `System: ${m.system}; Dose: ${m.dosage}; Frequency: ${m.frequency}; Timing: ${m.timing}` }],
      },
    })),
  };
}

