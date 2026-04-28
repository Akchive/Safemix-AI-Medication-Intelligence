/**
 * Firestore typed helpers for SafeMix.
 * All health data is stored under users/{uid}/... collections.
 */
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  deleteDoc, query, orderBy, limit,
  onSnapshot, type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { RegimenMedicine } from "@/lib/regimen";
import type { CachedVerdict } from "@/lib/interactionCache";

// ─── Medications ──────────────────────────────────────────────────────────────

export async function getMedications(uid: string): Promise<RegimenMedicine[]> {
  const snap = await getDocs(
    query(collection(db, "users", uid, "medications"), orderBy("addedAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RegimenMedicine));
}

export async function addMedication(uid: string, med: RegimenMedicine): Promise<void> {
  await setDoc(doc(db, "users", uid, "medications", med.id), {
    ...med,
    addedAt: med.addedAt,
    syncedAt: Date.now(),
  });
}

export async function removeMedication(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "medications", id));
}

// ─── Verdicts ─────────────────────────────────────────────────────────────────

export async function getVerdicts(uid: string): Promise<CachedVerdict[]> {
  const snap = await getDocs(
    query(collection(db, "users", uid, "verdicts"), orderBy("checkedAt", "desc"), limit(20))
  );
  return snap.docs.map((d) => ({ ...d.data() } as CachedVerdict));
}

export async function saveVerdictFirestore(uid: string, verdict: CachedVerdict): Promise<void> {
  await setDoc(doc(db, "users", uid, "verdicts", verdict.id), {
    ...verdict,
    syncedAt: Date.now(),
  });
}

// ─── Reminders ────────────────────────────────────────────────────────────────

export interface ReminderLog {
  status: "taken" | "missed";
  loggedAt: string;
}

export async function getReminderLogs(uid: string, date: string): Promise<Record<string, ReminderLog>> {
  const docSnap = await getDoc(doc(db, "users", uid, "reminder_logs", date));
  return docSnap.exists() ? (docSnap.data() as Record<string, ReminderLog>) : {};
}

export async function saveReminderLog(
  uid: string, date: string, key: string, log: ReminderLog
): Promise<void> {
  await setDoc(
    doc(db, "users", uid, "reminder_logs", date),
    { [key]: log },
    { merge: true }
  );
}

// ─── Doctor Share Log ─────────────────────────────────────────────────────────

export interface ShareLogEntry {
  token: string;
  issued: number;
  expiry: number;
  duration: string;
  revokedAt?: number;
}

export async function logShare(uid: string, entry: ShareLogEntry): Promise<void> {
  await addDoc(collection(db, "users", uid, "shares"), {
    ...entry,
    syncedAt: Date.now(),
  });
}

// ─── FCM Tokens ───────────────────────────────────────────────────────────────

export async function saveFcmTokenFirestore(uid: string, token: string): Promise<void> {
  await setDoc(
    doc(db, "users", uid, "fcm_tokens", token.slice(0, 40)),
    { token, updatedAt: Date.now() },
    { merge: true }
  );
}

// ─── ADR Reports — PvPI Suspected ADR + AIIA ASU&H ADR fields (PRD §14.1) ────
// Field names follow the PvPI form (AMC-PvPI-Suspected-ADR-Reporting-Form-v1.4)
// and the AIIA ASU&H ADR Form so we can submit upstream without remapping when
// the AYUSH Suraksha portal MoU lands (PRD §11 month 4–9).

export interface AdrReport {
  uid: string;
  // ── A. Patient information (PvPI §A) ────────────────────────────────────
  patientInitials?: string;
  patientAge?: number;        // years; PvPI accepts "Date of Birth or Age"
  patientWeightKg?: number;
  patientSex?: "F" | "M" | "X";

  // ── B. Suspected adverse reaction (PvPI §B) ─────────────────────────────
  reactionDescription: string;
  reactionStartDate: string;  // ISO YYYY-MM-DD
  reactionStopDate?: string;
  reactionOutcome:
    | "recovered"
    | "recovering"
    | "not_recovered"
    | "fatal"
    | "recovered_with_sequelae"
    | "unknown";
  seriousness: "non_serious" | "death" | "life_threatening" | "hospitalisation" | "disability" | "congenital_anomaly" | "other_serious";

  // ── C. Suspected medicines (PvPI §C) ────────────────────────────────────
  /** Brand or generic name */
  suspectedMedicine: string;
  /** Allopathic | Ayurvedic | Siddha | Unani | Homeopathy | OTC | Herbal | Home Remedy */
  medicineSystem: string;
  manufacturer?: string;
  batchNumber?: string;
  expiryDate?: string;
  dose?: string;
  route?: "oral" | "iv" | "im" | "sc" | "topical" | "inhalation" | "rectal" | "other";
  frequency?: string;
  therapyStartDate?: string;
  therapyStopDate?: string;
  indication?: string;
  /** Did the reaction stop after withdrawing the suspect drug? */
  dechallenge?: "yes" | "no" | "unknown" | "na";
  /** Did the reaction reappear when re-introducing the suspect drug? */
  rechallenge?: "yes" | "no" | "unknown" | "na";

  // ── D. Concomitant medical product (PvPI §D) ────────────────────────────
  concomitantMedicines?: string;

  // ── E. Other relevant history (PvPI §E) ─────────────────────────────────
  relevantHistory?: string;
  relevantTests?: string;

  // ── F. Reporter (PvPI §F) ───────────────────────────────────────────────
  reporterName?: string;
  reporterContact?: string;
  reporterPincode?: string;
  reporterQualification?: "physician" | "pharmacist" | "nurse" | "patient" | "caregiver" | "other";

  // ── Routing flags ───────────────────────────────────────────────────────
  /** True for any ASU&H drug (Ayurveda / Siddha / Unani / Homeopathy) — routes to AIIA */
  forwardToAIIA: boolean;
  /** True for any allopathic / OTC / herbal-supplement drug — routes to PvPI */
  forwardToPvPI: boolean;

  // Free-form notes from the legacy form (kept for backwards compatibility)
  notes?: string;
  doctorNotified?: boolean;
  status: "pending_review" | "reviewed" | "forwarded";
  reportedAt: number;
}

export async function submitAdrReport(uid: string, report: Omit<AdrReport, "uid" | "status" | "reportedAt">): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "adr_reports"), {
    uid,
    ...report,
    status: "pending_review",
    reportedAt: Date.now(),
  });
  await setDoc(doc(db, "adr_reports", ref.id), {
    uid,
    ...report,
    status: "pending_review",
    reportedAt: Date.now(),
    docId: ref.id,
  });
  return ref.id;
}

export async function getAllAdrReports(): Promise<(AdrReport & { docId: string })[]> {
  const snap = await getDocs(
    query(collection(db, "adr_reports"), orderBy("reportedAt", "desc"), limit(100))
  );
  return snap.docs.map((d) => ({ docId: d.id, ...d.data() } as AdrReport & { docId: string }));
}

// ─── Doctor Patient Snapshot ──────────────────────────────────────────────────
// When a patient generates a QR, their current regimen snapshot is written to
// doctor_snapshots/{jti}. The doctor's scan page reads this by jti from the JWT.
// The path is only discoverable via the signed JWT — security by path obscurity for MVP.

export interface PatientSnapshot {
  uid: string;
  jti: string;
  expiry: number;
  medications: RegimenMedicine[];
  activeAlerts: CachedVerdict[];
  patientName?: string;
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  acknowledgedNote?: string;
}

export async function writePatientSnapshot(snapshot: PatientSnapshot): Promise<void> {
  await setDoc(doc(db, "doctor_snapshots", snapshot.jti), snapshot);
}

export async function readPatientSnapshot(jti: string): Promise<PatientSnapshot | null> {
  const snap = await getDoc(doc(db, "doctor_snapshots", jti));
  return snap.exists() ? (snap.data() as PatientSnapshot) : null;
}

export async function acknowledgeSnapshot(
  jti: string,
  note: string,
  doctorLabel: string
): Promise<void> {
  await setDoc(
    doc(db, "doctor_snapshots", jti),
    { acknowledgedAt: Date.now(), acknowledgedBy: doctorLabel, acknowledgedNote: note },
    { merge: true }
  );
}

// Watch for doctor acknowledgement in real-time (patient side)
export function watchAcknowledgement(
  jti: string,
  callback: (ack: { acknowledgedAt: number; acknowledgedBy: string; acknowledgedNote: string } | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, "doctor_snapshots", jti), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    const data = snap.data() as PatientSnapshot;
    if (data.acknowledgedAt) {
      callback({
        acknowledgedAt: data.acknowledgedAt,
        acknowledgedBy: data.acknowledgedBy || "Doctor",
        acknowledgedNote: data.acknowledgedNote || "",
      });
    } else {
      callback(null);
    }
  });
}

// ─── Doctor flag-as-inaccurate (PRD §8.2 module 3) ───────────────────────────
// PRD: "≥ 3 unique flags triggers automatic re-review." For MVP we collect the
// flag and stash it in Firestore so the AI Review Queue picks it up.
export async function flagInteraction(args: {
  shareJti: string;
  alertId: string;
  flaggedBy: string;
  reason?: string;
}): Promise<void> {
  await addDoc(collection(db, "interaction_flags"), {
    ...args,
    createdAt: Date.now(),
  });
}

// ─── Migration: localStorage → Firestore ─────────────────────────────────────

export async function migrateLocalStorageToFirestore(uid: string): Promise<void> {
  try {
    // 1. Migrate regimen
    const raw = localStorage.getItem("safemix_regimen");
    if (raw) {
      const meds: RegimenMedicine[] = JSON.parse(raw);
      const existing = await getMedications(uid);
      const existingIds = new Set(existing.map((m) => m.id));
      for (const med of meds) {
        if (!existingIds.has(med.id)) {
          await addMedication(uid, med);
        }
      }
      const merged = await getMedications(uid);
      localStorage.setItem("safemix_regimen", JSON.stringify(merged));
    } else {
      // No local data — pull from Firestore
      const fsMeds = await getMedications(uid);
      if (fsMeds.length > 0) {
        localStorage.setItem("safemix_regimen", JSON.stringify(fsMeds));
      }
    }

    // 2. Migrate verdicts
    const verdictRaw = localStorage.getItem("safemix_interaction_cache");
    if (verdictRaw) {
      const verdicts: CachedVerdict[] = JSON.parse(verdictRaw);
      for (const v of verdicts) {
        await saveVerdictFirestore(uid, v);
      }
    }

    // 3. Pull Firestore verdicts back to localStorage if empty
    const localVerdicts = localStorage.getItem("safemix_interaction_cache");
    if (!localVerdicts || JSON.parse(localVerdicts).length === 0) {
      const fsVerdicts = await getVerdicts(uid);
      if (fsVerdicts.length > 0) {
        localStorage.setItem("safemix_interaction_cache", JSON.stringify(fsVerdicts));
      }
    }
  } catch (err) {
    console.error("[SafeMix] Firestore migration error:", err);
  }
}
