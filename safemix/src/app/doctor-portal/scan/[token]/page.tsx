"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, CheckCircle, AlertCircle, Clock, Shield, XCircle,
  Printer, Download, Send, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import Link from "next/link";
import { decodeDoctorShareToken } from "@/app/actions/doctorShare";
import {
  readPatientSnapshot, acknowledgeSnapshot, type PatientSnapshot,
} from "@/lib/firebase/firestore";
import type { CachedVerdict } from "@/lib/interactionCache";
import type { RegimenMedicine } from "@/lib/regimen";

const systemColor: Record<string, string> = {
  "Allopathic":   "#3B82F6",
  "Ayurvedic":    "#10B981",
  "Herbal":       "#8B5CF6",
  "Herbal / Plant-based": "#8B5CF6",
  "OTC":          "#F59E0B",
  "Supplement":   "#06B6D4",
  "Homeopathic":  "#EC4899",
  "Home Remedy":  "#6B7280",
};

const verdictConfig = {
  red:    { bg: "#FFF1F0", border: "#FFCCC7", text: "#C41C00", label: "HIGH RISK", icon: "❗" },
  yellow: { bg: "#FFFBE6", border: "#FFE58F", text: "#875400", label: "CAUTION", icon: "⚠️" },
  green:  { bg: "#F6FFED", border: "#B7EB8F", text: "#237804", label: "SAFE", icon: "✓" },
};

interface TokenPayload {
  uid: string;
  jti?: string;
  expiry: number;
  issued: number;
}

export default function DoctorPortalScanPage() {
  const params = useParams();
  const token = params?.token as string | undefined;
  const printRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "revoked" | "invalid">("loading");
  const [payload, setPayload] = useState<TokenPayload | null>(null);
  const [snapshot, setSnapshot] = useState<PatientSnapshot | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [showClinical, setShowClinical] = useState<Record<string, boolean>>({});

  // Acknowledgement
  const [ackNote, setAckNote] = useState("");
  const [ackName, setAckName] = useState("");
  const [ackSent, setAckSent] = useState(false);
  const [ackSending, setAckSending] = useState(false);

  const isRevoked = (t: string) => {
    try {
      const revoked: string[] = JSON.parse(localStorage.getItem("safemix_revoked_tokens") || "[]");
      return revoked.includes(t);
    } catch { return false; }
  };

  // Listen for real-time revocation
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "safemix_revoked_tokens" && token && isRevoked(token)) {
        setStatus("revoked");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [token]);

  // Verify JWT + load snapshot
  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    if (isRevoked(token)) { setStatus("revoked"); return; }

    (async () => {
      try {
        const decoded = await decodeDoctorShareToken(token);
        if (Date.now() >= decoded.expiry) { setStatus("expired"); return; }

        setPayload(decoded);
        setStatus("valid");

        // Load real patient snapshot from Firestore
        if (decoded.jti) {
          const snap = await readPatientSnapshot(decoded.jti);
          setSnapshot(snap);
        }

        // Start countdown
        const tick = () => {
          const ms = decoded.expiry - Date.now();
          if (ms <= 0) { setStatus("expired"); return; }
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          const s = Math.floor((ms % 60000) / 1000);
          setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
      } catch {
        setStatus("invalid");
      }
    })();
  }, [token]);

  const handleAcknowledge = async () => {
    if (!payload?.jti || !ackName.trim()) return;
    setAckSending(true);
    try {
      await acknowledgeSnapshot(payload.jti, ackNote.trim(), ackName.trim() || "Doctor");
      setAckSent(true);
    } catch (err) {
      console.error("Acknowledge failed:", err);
    } finally {
      setAckSending(false);
    }
  };

  const handlePrint = () => window.print();
  const handleDownload = () => {
    const content = printRef.current?.innerText || "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `safemix-report-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Status screens ───────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#F4F7F5] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-2 border-[#5E7464] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#7a9080] font-medium">Verifying secure token…</p>
        </div>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen bg-[#F4F7F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 flex items-center justify-center">
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="font-bold text-xl text-[#1a2820]">Access Expired</h2>
          <p className="text-sm text-[#7a9080]">This QR code has expired. Ask your patient to generate a new one.</p>
        </div>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <div className="min-h-screen bg-[#F4F7F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="font-bold text-xl text-[#1a2820]">Access Revoked</h2>
          <p className="text-sm text-[#7a9080]">The patient has revoked this QR code. Access is no longer permitted.</p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-[#F4F7F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="font-bold text-xl text-[#1a2820]">Invalid QR Code</h2>
          <p className="text-sm text-[#7a9080]">This QR is invalid or has been tampered with.</p>
        </div>
      </div>
    );
  }

  // ─── Valid: show patient data ─────────────────────────────────────────────────

  const meds: RegimenMedicine[] = snapshot?.medications ?? [];
  const alerts: CachedVerdict[] = snapshot?.activeAlerts ?? [];
  const redAlerts = alerts.filter(a => a.verdict === "red");
  const yellowAlerts = alerts.filter(a => a.verdict === "yellow");

  const overallVerdict = redAlerts.length > 0 ? "red" : yellowAlerts.length > 0 ? "yellow" : "green";
  const overallCfg = verdictConfig[overallVerdict];

  const systemGroups = meds.reduce<Record<string, RegimenMedicine[]>>((acc, m) => {
    const s = m.system || "Other";
    if (!acc[s]) acc[s] = [];
    acc[s].push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#F4F7F5] pb-16">
      {/* Header bar */}
      <div className="bg-white border-b border-[#e8f0ea] px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#5E7464] flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-manrope font-bold text-[#1a2820] text-sm">SafeMix</span>
            <span className="text-[10px] text-[#7a9080] ml-2">Doctor Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-600 font-mono font-medium">
          <Clock className="w-3.5 h-3.5" />
          {timeLeft}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5" ref={printRef}>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700 font-medium text-center">
          ⚕️ For clinical awareness only — not a prescription or diagnosis. Always apply professional judgment.
        </div>

        {/* Overall verdict */}
        <div
          className="rounded-3xl border p-6 text-center"
          style={{ background: overallCfg.bg, borderColor: overallCfg.border }}
        >
          <p className="text-4xl mb-2">{overallCfg.icon}</p>
          <p className="font-black text-2xl" style={{ color: overallCfg.text }}>{overallCfg.label}</p>
          <p className="text-sm mt-1" style={{ color: overallCfg.text }}>
            {meds.length} medicine{meds.length !== 1 ? "s" : ""} ·{" "}
            {redAlerts.length} high-risk · {yellowAlerts.length} caution{" "}
            · {alerts.filter(a => a.verdict === "green").length} safe interaction{alerts.filter(a => a.verdict === "green").length !== 1 ? "s" : ""}
          </p>
          {snapshot?.patientName && (
            <p className="text-xs mt-2 opacity-60">Patient: {snapshot.patientName}</p>
          )}
        </div>

        {/* Block 1 - Demographics (from snapshot metadata) */}
        <div className="bg-white rounded-3xl border border-[#e0e8e2] p-5 space-y-2">
          <h3 className="font-bold text-sm text-[#1a2820]">Patient Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-[#52615a]">
            <div className="bg-[#F8F8F4] rounded-xl p-2">
              <p className="text-[10px] text-[#9ab0a0] uppercase tracking-wide">Patient</p>
              <p className="font-medium">{snapshot?.patientName || "Anonymous"}</p>
            </div>
            <div className="bg-[#F8F8F4] rounded-xl p-2">
              <p className="text-[10px] text-[#9ab0a0] uppercase tracking-wide">Report Generated</p>
              <p className="font-medium">{snapshot ? new Date(snapshot.createdAt).toLocaleString("en-IN") : "—"}</p>
            </div>
            <div className="bg-[#F8F8F4] rounded-xl p-2">
              <p className="text-[10px] text-[#9ab0a0] uppercase tracking-wide">Total Medicines</p>
              <p className="font-medium">{meds.length}</p>
            </div>
            <div className="bg-[#F8F8F4] rounded-xl p-2">
              <p className="text-[10px] text-[#9ab0a0] uppercase tracking-wide">Active Alerts</p>
              <p className="font-medium" style={{ color: redAlerts.length > 0 ? "#C41C00" : "#237804" }}>
                {redAlerts.length} Red · {yellowAlerts.length} Yellow
              </p>
            </div>
          </div>
        </div>

        {/* Block 2 - Medication list grouped by system */}
        {meds.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#e0e8e2] p-8 text-center text-[#9ab0a0] text-sm">
            {snapshot === null
              ? "Loading patient data from Firestore…"
              : "No medicines recorded in this regimen."}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-[#e0e8e2] p-5 space-y-4">
            <h3 className="font-bold text-sm text-[#1a2820]">Medication Regimen</h3>
            {Object.entries(systemGroups).map(([sys, meds]) => (
              <div key={sys}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: systemColor[sys] || "#9ab0a0" }} />
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: systemColor[sys] || "#9ab0a0" }}>{sys}</span>
                </div>
                <div className="space-y-2 pl-4">
                  {meds.map((m) => (
                    <div key={m.id} className="bg-[#F8F8F4] rounded-xl p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1a2820]">{m.name}</p>
                        <p className="text-xs text-[#7a9080] mt-0.5">
                          {[m.dosage, m.frequency, m.timing].filter(Boolean).join(" · ")}
                          {m.withFood !== undefined && (m.withFood ? " · With food" : " · Empty stomach")}
                        </p>
                      </div>
                      {m.startDate && (
                        <span className="text-[10px] text-[#9ab0a0] whitespace-nowrap">Since {m.startDate}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Block 3 - Interaction alerts */}
        {alerts.length > 0 && (
          <div className="bg-white rounded-3xl border border-[#e0e8e2] p-5 space-y-3">
            <h3 className="font-bold text-sm text-[#1a2820]">Interaction Alerts</h3>
            {alerts.map((alert, i) => {
              const cfg = verdictConfig[alert.verdict] || verdictConfig.green;
              const key = `alert_${i}`;
              return (
                <div key={key} className="rounded-2xl border p-4 space-y-2"
                  style={{ background: cfg.bg, borderColor: cfg.border }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black px-2 py-0.5 rounded-full"
                        style={{ background: cfg.border, color: cfg.text }}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-semibold text-[#1a2820]">{alert.medicine}</span>
                      {alert.source && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 text-[#7a9080] font-medium">
                          {alert.source === "rules" ? "📋 Rule Engine" : "🤖 AI"}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowClinical(prev => ({ ...prev, [key]: !prev[key] }))}
                      className="text-[10px] text-[#7a9080] flex items-center gap-1">
                      {showClinical[key] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showClinical[key] ? "Less" : "Detail"}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: cfg.text }}>{alert.reason}</p>
                  {showClinical[key] && alert.suggestion && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: cfg.border }}>
                      <p className="text-xs font-semibold" style={{ color: cfg.text }}>Recommendation:</p>
                      <p className="text-xs mt-0.5" style={{ color: cfg.text }}>{alert.suggestion}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Block 4 - Acknowledgement */}
        <div className="bg-white rounded-3xl border border-[#e0e8e2] p-5 space-y-4">
          <h3 className="font-bold text-sm text-[#1a2820]">Send Acknowledgement to Patient</h3>
          <p className="text-xs text-[#7a9080]">
            The patient will see your acknowledgement instantly on their device.
          </p>
          {ackSent ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-700">Acknowledgement sent!</p>
                <p className="text-xs text-emerald-600">The patient has been notified.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your name (e.g. Dr. Suresh Reddy)"
                value={ackName}
                onChange={e => setAckName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#e0e8e2] text-sm text-[#1a2820] outline-none focus:border-[#5E7464]"
              />
              <textarea
                rows={2}
                placeholder="Clinical note (optional) — e.g. 'Reviewed. Please space metformin and karela by 2 hours.'"
                value={ackNote}
                onChange={e => setAckNote(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#e0e8e2] text-sm text-[#1a2820] outline-none focus:border-[#5E7464] resize-none"
              />
              <button
                onClick={handleAcknowledge}
                disabled={!ackName.trim() || ackSending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}
              >
                {ackSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {ackSending ? "Sending…" : "Send Acknowledgement"}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#e0e8e2] text-sm font-medium text-[#52615a] hover:bg-white transition-all">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={handleDownload}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#e0e8e2] text-sm font-medium text-[#52615a] hover:bg-white transition-all">
            <Download className="w-4 h-4" /> Download
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[#9ab0a0] pb-4">
          SafeMix — For awareness only, not diagnosis. Token verified via HMAC-SHA256 JWT.
        </p>
      </div>
    </div>
  );
}
