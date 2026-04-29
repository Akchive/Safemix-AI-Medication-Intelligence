"use client";
import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Clock, Shield, Share2, ArrowRight, History, Copy, CheckCheck, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { trackEvent, AnalyticsEvents, getAnalyticsContext } from "@/lib/analytics";
import { issueDoctorShareToken } from "@/app/actions/doctorShare";
import { logShare, writePatientSnapshot, watchAcknowledgement } from "@/lib/firebase/firestore";
import { getRegimen } from "@/lib/regimen";
import { getCachedVerdicts } from "@/lib/interactionCache";

const pastShares = [
  { id: "S123", doctor: "Dr. Sharma", hospital: "Apollo Hospitals", date: "24 Apr 2026", expiry: "Expired", status: "Expired" },
  { id: "S124", doctor: "Dr. Reddy", hospital: "Self-Share", date: "26 Apr 2026", expiry: "In 2 hours", status: "Active" },
];

export default function DoctorSharePage() {
  const { user } = useAuth();
  const [expiry, setExpiry] = useState("1 hour");
  const [generating, setGenerating] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [expiryTimestamp, setExpiryTimestamp] = useState<number | null>(null);
  const [currentJti, setCurrentJti] = useState<string | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<{ acknowledgedAt: number; acknowledgedBy: string; acknowledgedNote: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubAckRef = useRef<(() => void) | null>(null);

  const expiryMs: Record<string, number> = {
    "15 min":  15 * 60 * 1000,
    "1 hour":  60 * 60 * 1000,
    "24 hour": 24 * 60 * 60 * 1000,
  };

  // Live countdown ticker
  useEffect(() => {
    if (!expiryTimestamp) return;

    // Tick immediately
    const tick = () => {
      const remaining = expiryTimestamp - Date.now();
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setTimeLeft("Expired");
        setQrGenerated(false); // auto-revoke the QR card
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      if (h > 0) {
        setTimeLeft(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
      } else {
        setTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current!);
  }, [expiryTimestamp]);

  const handleGenerate = () => {
    setGenerating(true);
    setAcknowledgement(null);
    if (unsubAckRef.current) { unsubAckRef.current(); unsubAckRef.current = null; }

    setTimeout(async () => {
      try {
        const uid = user?.uid || `guest_${Date.now()}`;
        const durationMs = expiryMs[expiry] || 3600000;
        const issued = Date.now();
        const expiryTime = issued + durationMs;

        // Server-side JWT signing — secret never leaves the server
        const { token, payload: jwtPayload } = await issueDoctorShareToken(uid, durationMs);
        const jti = jwtPayload.jti;
        const encodedToken = encodeURIComponent(token);

        // Write real patient regimen snapshot to Firestore
        const medications = getRegimen();
        const allVerdicts = getCachedVerdicts();
        const activeAlerts = allVerdicts.filter(v => v.verdict === "red" || v.verdict === "yellow");
        const patientName = user?.displayName || user?.phoneNumber || "Patient";

        if (jti) {
          writePatientSnapshot({
            uid,
            jti,
            expiry: expiryTime,
            medications,
            activeAlerts,
            patientName,
            createdAt: issued,
          }).catch(console.error);

          // Watch for doctor acknowledgement in real time
          setCurrentJti(jti);
          unsubAckRef.current = watchAcknowledgement(jti, setAcknowledgement);
        }

        // Store in localStorage for share history UI
        const shares = JSON.parse(localStorage.getItem("safemix_shares") || "[]");
        shares.unshift({ token: encodedToken, doctor: "Doctor", issued, expiry: expiryTime, duration: expiry });
        localStorage.setItem("safemix_shares", JSON.stringify(shares.slice(0, 10)));

        const url = `${window.location.origin}/doctor-portal/scan/${encodedToken}`;
        setQrUrl(url);
        setExpiryTimestamp(expiryTime);
        setGenerating(false);
        setQrGenerated(true);

        if (user?.uid) {
          logShare(user.uid, { token: encodedToken, issued, expiry: expiryTime, duration: expiry }).catch(console.error);
        }

        await trackEvent(AnalyticsEvents.QR_GENERATED, { expiry, ...getAnalyticsContext() });
      } catch (err) {
        console.error("[SafeMix] Token generation failed:", err);
        setGenerating(false);
      }
    }, 1200);
  };

  const handleRevoke = () => {
    clearInterval(timerRef.current!);

    // Write token to revoked registry so the scan page blocks access immediately
    if (qrUrl) {
      const token = qrUrl.split("/doctor-portal/scan/")[1];
      if (token) {
        const revoked: string[] = JSON.parse(localStorage.getItem("safemix_revoked_tokens") || "[]");
        if (!revoked.includes(token)) {
          revoked.unshift(token);
          localStorage.setItem("safemix_revoked_tokens", JSON.stringify(revoked.slice(0, 50)));
        }
      }
    }

    setQrGenerated(false);
    setTimeLeft("");
    setExpiryTimestamp(null);
    setQrUrl("");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(qrUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-manrope font-bold text-2xl text-[#1a2820]">Doctor Share</h1>
        <p className="text-sm text-[#7a9080] mt-1">Generate a secure, time-limited QR code for your doctor to review your medicines.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Generator */}
        <div className="bg-white rounded-3xl border border-[#e0e8e2] p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#5E7464]/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#5E7464]" />
            </div>
            <h2 className="font-manrope font-semibold text-[#1a2820]">Generate Secure Link</h2>
          </div>

          {!qrGenerated ? (
            <>
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest">Access Duration</label>
                <div className="grid grid-cols-3 gap-3">
                  {["15 min", "1 hour", "24 hour"].map((time) => (
                    <button
                      key={time}
                      onClick={() => setExpiry(time)}
                      className={`py-3 rounded-2xl border text-sm font-medium transition-all ${ expiry === time ? "border-[#5E7464] bg-[#f0f8f2] text-[#42594A] " : "border-[#e0e8e2] bg-[#F8F8F4] text-[#7a9080] hover:border-[#5E7464]/40" }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Privacy Note:</strong> Your doctor will see your current medicine regimen and interaction analysis. They will NOT see your personal settings or full history.
                </p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-3 text-white text-sm font-semibold py-4 rounded-2xl transition-all hover:shadow-[0_8px_30px_rgba(94,116,100,0.35)] active:scale-[0.99] disabled:opacity-70"
                style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}
              >
                {generating ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <QrCode className="w-5 h-5" />
                    Generate Doctor QR
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
              <div className="w-48 h-48 mx-auto bg-white p-4 rounded-3xl border-4 border-[#f0f8f2] shadow-sm relative group flex items-center justify-center">
                <QRCodeSVG
                  value={qrUrl}
                  size={160}
                  fgColor="#1a2820"
                  bgColor="#ffffff"
                  level="M"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                  <span className="text-xs font-bold text-[#42594A]">SCAN TO VIEW</span>
                </div>
              </div>
              
              <div>
                <p className="font-semibold text-[#1a2820]">QR Code Active</p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 mt-1 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {timeLeft ? (
                    <span className="font-mono tracking-tight">Expires in <strong>{timeLeft}</strong></span>
                  ) : (
                    <span>Starting timer…</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#e0e8e2] text-xs font-semibold text-[#52615a] hover:bg-[#f0f5f1] transition-all">
                  {copied ? <><CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Link</>}
                </button>
                <button onClick={handleRevoke} className="flex-1 py-3 rounded-2xl bg-[#f0f5f1] text-xs font-semibold text-[#52615a] hover:bg-[#e0e8e2] transition-all">
                  Revoke Now
                </button>
              </div>

              {/* Doctor acknowledgement — real-time via Firestore onSnapshot */}
              {acknowledgement ? (
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-xs font-bold text-emerald-700">
                      ✓ Acknowledged by {acknowledgement.acknowledgedBy}
                    </p>
                    {acknowledgement.acknowledgedNote && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        "{acknowledgement.acknowledgedNote}"
                      </p>
                    )}
                    <p className="text-[10px] text-emerald-500 mt-0.5">
                      {new Date(acknowledgement.acknowledgedAt).toLocaleTimeString("en-IN")}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#9ab0a0] animate-pulse">Waiting for doctor to scan &amp; acknowledge…</p>
              )}
            </div>
          )}
        </div>

        {/* Info / Past Shares */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-[#e0e8e2] p-6">
            <h3 className="font-manrope font-semibold text-[#1a2820] mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-[#9ab0a0]" />
              Past Shares
            </h3>
            <div className="space-y-3">
              {pastShares.map((share) => (
                <div key={share.id} className="p-4 rounded-2xl bg-[#F8F8F4] border border-[#e0e8e2] flex items-center justify-between group hover:border-[#5E7464]/30 transition-all">
                  <div>
                    <p className="text-sm font-semibold text-[#1a2820]">{share.doctor}</p>
                    <p className="text-[10px] text-[#9ab0a0] mt-0.5">{share.hospital} • {share.date}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ share.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-[#e8ede9] text-[#7a9080]" }`}>
                      {share.status}
                    </span>
                    <p className="text-[10px] text-[#9ab0a0] mt-1">{share.expiry}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#42594A] to-[#2d4035] rounded-3xl p-6 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-500" />
            <h3 className="font-manrope font-bold text-lg mb-2 relative z-10">How it works</h3>
            <ul className="space-y-3 relative z-10">
              {[
                "1. Choose an expiry duration",
                "2. Show the QR to your doctor",
                "3. They see your safety report",
                "4. Access vanishes automatically"
              ].map((step) => (
                <li key={step} className="text-xs text-white/80 flex items-center gap-2 font-medium">
                  <ArrowRight className="w-3 h-3 text-[#b5ccba]" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
