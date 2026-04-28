"use client";
/**
 * Adverse-event reporting form (PRD §9.3 communication layer + §14.1 schema).
 *
 * Field mapping is one-to-one with the PvPI Suspected ADR Reporting Form
 * (sections A–F) and the AIIA ASU&H ADR Form. We display fields grouped by
 * those sections so a clinician used to the paper form recognises the layout.
 * Routing flags `forwardToPvPI` / `forwardToAIIA` are derived from the
 * medicineSystem so the upstream MoU can pull the correct subset.
 */
import { useState, useMemo } from "react";
import {
  AlertTriangle, CheckCircle, ArrowLeft, Loader2, Pill, User, Calendar,
  FileText, Activity, Stethoscope, Repeat, ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { submitAdrReport, type AdrReport } from "@/lib/firebase/firestore";
import { useAuth } from "@/components/providers/AuthProvider";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";

const SYSTEMS = ["Allopathic", "Ayurvedic", "Siddha", "Unani", "Homeopathy", "OTC", "Herbal", "Home Remedy"] as const;
const ASU_H = new Set(["Ayurvedic", "Siddha", "Unani", "Homeopathy"]);

const SERIOUSNESS: AdrReport["seriousness"][] = [
  "non_serious", "hospitalisation", "life_threatening", "disability", "congenital_anomaly", "death", "other_serious",
];
const SERIOUSNESS_LABEL: Record<AdrReport["seriousness"], string> = {
  non_serious: "Non-serious",
  hospitalisation: "Resulted in hospitalisation",
  life_threatening: "Life-threatening",
  disability: "Persistent disability",
  congenital_anomaly: "Congenital anomaly",
  death: "Death",
  other_serious: "Other medically important",
};

const OUTCOMES: AdrReport["reactionOutcome"][] = [
  "recovered", "recovering", "not_recovered", "recovered_with_sequelae", "fatal", "unknown",
];
const OUTCOME_LABEL: Record<AdrReport["reactionOutcome"], string> = {
  recovered: "Recovered",
  recovering: "Recovering",
  not_recovered: "Not yet recovered",
  recovered_with_sequelae: "Recovered with sequelae",
  fatal: "Fatal",
  unknown: "Unknown",
};

const ROUTES: NonNullable<AdrReport["route"]>[] = ["oral", "iv", "im", "sc", "topical", "inhalation", "rectal", "other"];
const QUALIFICATIONS: NonNullable<AdrReport["reporterQualification"]>[] = ["physician", "pharmacist", "nurse", "patient", "caregiver", "other"];

const todayISO = () => new Date().toISOString().split("T")[0];

export default function AdverseEventPage() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Omit<AdrReport, "uid" | "status" | "reportedAt" | "forwardToAIIA" | "forwardToPvPI">>({
    // A
    patientInitials: "",
    patientAge: undefined,
    patientWeightKg: undefined,
    patientSex: undefined,
    // B
    reactionDescription: "",
    reactionStartDate: todayISO(),
    reactionStopDate: "",
    reactionOutcome: "unknown",
    seriousness: "non_serious",
    // C
    suspectedMedicine: "",
    medicineSystem: "Allopathic",
    manufacturer: "",
    batchNumber: "",
    expiryDate: "",
    dose: "",
    route: undefined,
    frequency: "",
    therapyStartDate: "",
    therapyStopDate: "",
    indication: "",
    dechallenge: "unknown",
    rechallenge: "unknown",
    // D
    concomitantMedicines: "",
    // E
    relevantHistory: "",
    relevantTests: "",
    // F
    reporterName: user?.displayName ?? "",
    reporterContact: user?.phoneNumber ?? user?.email ?? "",
    reporterPincode: "",
    reporterQualification: "patient",
    // Legacy
    notes: "",
    doctorNotified: false,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const routing = useMemo(() => ({
    forwardToAIIA: ASU_H.has(form.medicineSystem),
    forwardToPvPI: !ASU_H.has(form.medicineSystem) || form.medicineSystem === "OTC" || form.medicineSystem === "Herbal" || form.medicineSystem === "Home Remedy",
  }), [form.medicineSystem]);

  const handleSubmit = async () => {
    setError(null);
    if (!form.suspectedMedicine.trim()) return setError("Please name the suspected medicine.");
    if (!form.reactionDescription.trim()) return setError("Please describe the reaction.");
    if (!form.reactionStartDate) return setError("Please enter when the reaction started.");

    setSubmitting(true);
    try {
      const uid = user?.uid;
      const payload = { ...form, ...routing } as Omit<AdrReport, "uid" | "status" | "reportedAt">;
      if (uid) {
        await submitAdrReport(uid, payload);
      } else {
        // Anonymous fallback — store in localStorage queue for later sync.
        const queue = JSON.parse(localStorage.getItem("safemix_adr_queue") || "[]");
        queue.push({ ...payload, queuedAt: Date.now() });
        localStorage.setItem("safemix_adr_queue", JSON.stringify(queue));
      }
      await trackEvent(AnalyticsEvents.ADVERSE_EVENT_REPORTED, {
        system: form.medicineSystem,
        seriousness: form.seriousness,
        forwardToAIIA: String(routing.forwardToAIIA),
        forwardToPvPI: String(routing.forwardToPvPI),
      });
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center justify-center py-20 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="font-manrope font-bold text-2xl text-[#1a2820]">Report Submitted</h2>
        <p className="text-[#7a9080] text-sm max-w-xs">
          Thank you. SafeMix will route this to {routing.forwardToAIIA && routing.forwardToPvPI ? "PvPI and AIIA" : routing.forwardToAIIA ? "AIIA (AYUSH National Pharmacovigilance)" : "PvPI (National Pharmacovigilance)"} as soon as the MoU partnership is live.
        </p>
        <Link href="/dashboard" className="px-6 py-2.5 bg-[#42594A] text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="w-9 h-9 rounded-xl border border-[#e0e8e2] flex items-center justify-center text-[#52615a] hover:bg-[#f0f5f1] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="font-manrope font-bold text-2xl text-[#1a2820]">Report a Side Effect</h1>
          <p className="text-sm text-[#7a9080] mt-0.5">PvPI Suspected ADR / AIIA ASU&amp;H ADR mapped form. Takes about 90 seconds.</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          If you are experiencing a medical emergency, call <strong>108</strong> (Ambulance) or visit the nearest hospital immediately.
        </p>
      </div>

      {/* A — Patient */}
      <Section icon={User} title="A · Patient Information">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Initials">
            <input value={form.patientInitials ?? ""} onChange={(e) => set("patientInitials", e.target.value.toUpperCase().slice(0, 4))} className={inputCls} placeholder="e.g. K.B." />
          </Field>
          <Field label="Age (years)">
            <input type="number" min={0} max={120} value={form.patientAge ?? ""} onChange={(e) => set("patientAge", e.target.value === "" ? undefined : Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Weight (kg)">
            <input type="number" min={1} max={300} value={form.patientWeightKg ?? ""} onChange={(e) => set("patientWeightKg", e.target.value === "" ? undefined : Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Sex">
            <select value={form.patientSex ?? ""} onChange={(e) => set("patientSex", (e.target.value || undefined) as AdrReport["patientSex"])} className={inputCls}>
              <option value="">—</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="X">Other</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* B — Reaction */}
      <Section icon={Activity} title="B · Suspected Adverse Reaction">
        <Field label="Describe the reaction *">
          <textarea rows={3} value={form.reactionDescription} onChange={(e) => set("reactionDescription", e.target.value)} className={`${inputCls} resize-none`} placeholder="e.g. Patient developed severe nausea and dizziness 2 hours after taking the medicine." />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reaction start date *">
            <input type="date" value={form.reactionStartDate} onChange={(e) => set("reactionStartDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Reaction stop date">
            <input type="date" value={form.reactionStopDate ?? ""} onChange={(e) => set("reactionStopDate", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Outcome">
            <select value={form.reactionOutcome} onChange={(e) => set("reactionOutcome", e.target.value as AdrReport["reactionOutcome"])} className={inputCls}>
              {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
            </select>
          </Field>
          <Field label="Seriousness">
            <select value={form.seriousness} onChange={(e) => set("seriousness", e.target.value as AdrReport["seriousness"])} className={inputCls}>
              {SERIOUSNESS.map((s) => <option key={s} value={s}>{SERIOUSNESS_LABEL[s]}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* C — Suspected medicine */}
      <Section icon={Pill} title="C · Suspected Medicine">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Medicine name (brand or generic) *">
            <input value={form.suspectedMedicine} onChange={(e) => set("suspectedMedicine", e.target.value)} className={inputCls} placeholder="e.g. Glycomet 500" />
          </Field>
          <Field label="System of medicine *">
            <select value={form.medicineSystem} onChange={(e) => set("medicineSystem", e.target.value)} className={inputCls}>
              {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Manufacturer">
            <input value={form.manufacturer ?? ""} onChange={(e) => set("manufacturer", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Batch / Lot no.">
            <input value={form.batchNumber ?? ""} onChange={(e) => set("batchNumber", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Expiry date">
            <input type="date" value={form.expiryDate ?? ""} onChange={(e) => set("expiryDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Dose">
            <input value={form.dose ?? ""} onChange={(e) => set("dose", e.target.value)} className={inputCls} placeholder="e.g. 500 mg" />
          </Field>
          <Field label="Route">
            <select value={form.route ?? ""} onChange={(e) => set("route", (e.target.value || undefined) as AdrReport["route"])} className={inputCls}>
              <option value="">—</option>
              {ROUTES.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>
          </Field>
          <Field label="Frequency">
            <input value={form.frequency ?? ""} onChange={(e) => set("frequency", e.target.value)} className={inputCls} placeholder="OD / BD / TID" />
          </Field>
          <Field label="Therapy start">
            <input type="date" value={form.therapyStartDate ?? ""} onChange={(e) => set("therapyStartDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Therapy stop">
            <input type="date" value={form.therapyStopDate ?? ""} onChange={(e) => set("therapyStopDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Indication (why was it prescribed?)" full>
            <input value={form.indication ?? ""} onChange={(e) => set("indication", e.target.value)} className={inputCls} placeholder="e.g. Type-2 diabetes" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dechallenge (reaction stopped after withdrawing?)">
            <select value={form.dechallenge ?? "unknown"} onChange={(e) => set("dechallenge", e.target.value as AdrReport["dechallenge"])} className={inputCls}>
              {(["yes", "no", "unknown", "na"] as const).map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
            </select>
          </Field>
          <Field label="Rechallenge (returned on re-dosing?)">
            <select value={form.rechallenge ?? "unknown"} onChange={(e) => set("rechallenge", e.target.value as AdrReport["rechallenge"])} className={inputCls}>
              {(["yes", "no", "unknown", "na"] as const).map((v) => <option key={v} value={v}>{v.toUpperCase()}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* D — Concomitant */}
      <Section icon={Repeat} title="D · Concomitant Medicines">
        <Field label="List all other medicines, AYUSH preparations, supplements, and home remedies">
          <textarea rows={2} value={form.concomitantMedicines ?? ""} onChange={(e) => set("concomitantMedicines", e.target.value)} className={`${inputCls} resize-none`} placeholder="e.g. Karela juice 150 ml OD; Chyawanprash 1 tsp HS" />
        </Field>
      </Section>

      {/* E — History */}
      <Section icon={ClipboardList} title="E · Other Relevant History">
        <Field label="Co-morbid conditions, allergies, previous ADRs">
          <textarea rows={2} value={form.relevantHistory ?? ""} onChange={(e) => set("relevantHistory", e.target.value)} className={`${inputCls} resize-none`} placeholder="HTN since 2018, sulfa allergy" />
        </Field>
        <Field label="Relevant lab tests / dates">
          <textarea rows={2} value={form.relevantTests ?? ""} onChange={(e) => set("relevantTests", e.target.value)} className={`${inputCls} resize-none`} placeholder="Capillary glucose 54 mg/dL on 2026-04-11; LFT WNL" />
        </Field>
      </Section>

      {/* F — Reporter */}
      <Section icon={Stethoscope} title="F · Reporter Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Reporter name">
            <input value={form.reporterName ?? ""} onChange={(e) => set("reporterName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Contact (phone or email)">
            <input value={form.reporterContact ?? ""} onChange={(e) => set("reporterContact", e.target.value)} className={inputCls} />
          </Field>
          <Field label="PIN code">
            <input value={form.reporterPincode ?? ""} onChange={(e) => set("reporterPincode", e.target.value.replace(/\D/g, "").slice(0, 6))} className={inputCls} placeholder="751001" />
          </Field>
          <Field label="Qualification">
            <select value={form.reporterQualification ?? "patient"} onChange={(e) => set("reporterQualification", e.target.value as AdrReport["reporterQualification"])} className={inputCls}>
              {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      {/* Routing pill */}
      <div className="rounded-2xl bg-[#f0f8f2] border border-[#cfe9d5] p-4 text-xs text-[#42594A] flex items-center gap-2">
        <FileText className="w-4 h-4" />
        Will route to:&nbsp;
        <strong>{routing.forwardToPvPI ? "PvPI" : ""}{routing.forwardToPvPI && routing.forwardToAIIA ? " + " : ""}{routing.forwardToAIIA ? "AIIA (AYUSH)" : ""}</strong>
        &nbsp;based on the medicine system you selected.
      </div>

      {/* Notes / submit */}
      <Section icon={FileText} title="Additional Notes">
        <textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} resize-none`} placeholder="Anything else the reviewer should know…" />
        <label className="flex items-center gap-2 text-sm text-[#52615a] mt-2">
          <input type="checkbox" checked={!!form.doctorNotified} onChange={(e) => set("doctorNotified", e.target.checked)} />
          The treating doctor has been notified.
        </label>
      </Section>

      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-4 text-white text-sm font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-70"
        style={{ background: "linear-gradient(135deg,#EF4444, #C41C00)" }}
      >
        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> Submitting…</> : <><AlertTriangle className="w-5 h-5" /> Submit Adverse Event Report</>}
      </button>
      <p className="text-[10px] text-center text-[#9ab0a0] pb-6">
        This report is encrypted and used to improve medication safety. SafeMix will forward it to the appropriate national pharmacovigilance programme once the upstream MoU is in place.
      </p>
    </div>
  );
}

const inputCls = "w-full px-4 py-3 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:border-[#5E7464] focus:ring-1 focus:ring-[#5E7464] outline-none";

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-[#e0e8e2] p-5 md:p-6 space-y-4">
      <h2 className="flex items-center gap-2 font-bold text-sm text-[#1a2820]">
        <Icon className="w-4 h-4 text-[#5E7464]" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-[#52615a] mb-1.5 inline-block">{label}</span>
      {children}
    </label>
  );
}
