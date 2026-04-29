"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SafeMixLogo from "@/components/ui/Logo";
import { Check, ArrowRight, ShieldCheck, AlertCircle, ChevronLeft, Phone } from "lucide-react";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  getIdToken,
  type ConfirmationResult,
} from "firebase/auth";
import { initializeSelfRole } from "@/app/actions/adminClaims";

declare global {
  interface Window { recaptchaVerifierSignup?: RecaptchaVerifier; }
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const roles = [
  { id: "patient",   label: "Patient",   desc: "Managing my own medicines",       icon: "person" },
  { id: "caregiver", label: "Caregiver", desc: "Managing medicines for family",   icon: "family_restroom" },
];
const conditionsList = ["Diabetes", "Hypertension", "Thyroid", "Asthma", "Heart Disease", "Kidney Disease", "Arthritis"];

type Step = "profile" | "phone" | "otp" | "done";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");

  // Profile form
  const [role,          setRole]          = useState("patient");
  const [name,          setName]          = useState("");
  const [age,           setAge]           = useState("");
  const [sex,           setSex]           = useState("prefer_not_to_say");
  const [conditions,    setConditions]    = useState<string[]>([]);
  const [consentGiven,  setConsentGiven]  = useState(false);

  // Phone OTP
  const [phone,   setPhone]   = useState("");
  const [otp,     setOtp]     = useState("");
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);

  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.recaptchaVerifierSignup) {
      window.recaptchaVerifierSignup = new RecaptchaVerifier(auth, "recaptcha-signup", { size: "invisible" });
    }
  }, []);

  // Handle Google redirect result (mobile-safe auth flow)
  useEffect(() => {
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result?.user) return;
        const pendingRole = (typeof window !== "undefined" ? localStorage.getItem("safemix_pending_signup_role") : null) || role;
        const pendingName = (typeof window !== "undefined" ? localStorage.getItem("safemix_pending_signup_name") : null) || name;
        await initializeSelfRole(result.user.uid, pendingRole);
        await getIdToken(result.user, true);
        saveProfile(result.user.uid, result.user.displayName || pendingName || "User");
        if (typeof window !== "undefined") {
          localStorage.removeItem("safemix_pending_signup_role");
          localStorage.removeItem("safemix_pending_signup_name");
        }
        router.replace("/dashboard");
      } catch (e: any) {
        if (e?.code === "auth/popup-closed-by-user") {
          setError("Google sign-in was interrupted. Please try again.");
        } else if (e?.code) {
          setError(`Google sign-in failed (${e.code}).`);
        } else {
          setError("Google sign-in failed. Please try again.");
        }
      }
    })();
    // Intentionally run once on mount; values are only fallback defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCondition = (c: string) =>
    setConditions((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  // Save profile to Firestore (fire-and-forget)
  const saveProfile = (uid: string, displayName: string) => {
    setDoc(doc(db, "users", uid), {
      role, displayName,
      ageBand: age, sex, conditions,
      abhaLinkageStatus: "pending",
      consentVersion: "v1.0",
      createdAt: new Date().toISOString(),
    }).catch((e) => console.warn("Firestore sync deferred:", e));
  };

  // Step 1: validate profile fields → go to phone step
  const handleProfileNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Please enter your full name."); return; }
    if (!age || Number(age) < 1 || Number(age) > 120) { setError("Enter a valid age."); return; }
    if (!consentGiven) { setError("You must accept the DPDP consent notice to continue."); return; }
    setStep("phone");
  };

  // ── Google: sign up in one click ─────────────────────────────────────────
  const handleGoogle = async () => {
    setError("");
    if (!consentGiven) { setError("Please accept the DPDP consent notice first."); return; }
    if (!name.trim()) { setError("Please enter your name first."); return; }
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const isMobile = typeof window !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (isMobile) {
        // On mobile browsers, redirect flow is more reliable than popup.
        localStorage.setItem("safemix_pending_signup_name", name.trim());
        localStorage.setItem("safemix_pending_signup_role", role);
        await signInWithRedirect(auth, provider);
        return;
      }

      const cred = await signInWithPopup(auth, provider);
      await initializeSelfRole(cred.user.uid, role);
      await getIdToken(cred.user, true);
      saveProfile(cred.user.uid, cred.user.displayName || name);
      router.replace("/dashboard");
    } catch (e: any) {
      if (e?.code === "auth/popup-closed-by-user") {
        setError("Google sign-in popup was closed. Please retry, or use Phone OTP below.");
      } else if (e?.code === "auth/popup-blocked") {
        setError("Popup blocked by browser. Please retry or use Phone OTP.");
      } else {
        setError(e.message || "Google sign-in failed.");
      }
      setLoading(false);
    }
  };

  // Step 2: send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Enter a valid 10-digit mobile number."); return; }
    setLoading(true);
    try {
      const formatted = digits.length === 10 ? `+91${digits}` : `+${digits}`;
      const result = await signInWithPhoneNumber(auth, formatted, window.recaptchaVerifierSignup!);
      setConfirm(result);
      setStep("otp");
    } catch (e: any) {
      setError(e.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: verify OTP → create Firestore record → redirect
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!confirm) return;
    setLoading(true);
    try {
      const cred = await confirm.confirm(otp);
      await initializeSelfRole(cred.user.uid, role);
      await getIdToken(cred.user, true);
      saveProfile(cred.user.uid, name);
      router.replace("/dashboard");
    } catch {
      setError("Invalid OTP. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F8F8F4]">
      <div id="recaptcha-signup" />

      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] relative overflow-hidden p-12 bg-[#2d4035]">
        <Link href="/"><SafeMixLogo size={36} textSize="text-xl" /></Link>
        <div className="relative z-10">
          <h2 className="font-manrope font-bold text-4xl text-white mb-5 leading-tight">
            SafeMix<br />Dual-Medicine Intelligence
          </h2>
          <p className="text-[#9ab0a0] text-lg mb-10">India&apos;s first safety layer for Allopathic + AYUSH medications.</p>
          <div className="space-y-3">
            {["Red/Yellow/Green safety verdicts", "Plain-language interaction explanations", "Works for 8 Indian medicine systems"].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-[#b5ccba]" />
                </div>
                <span className="text-[#c3d4c8] text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#7a9080]">
          <ShieldCheck className="w-4 h-4" />
          DPDP Act 2023 compliant · Data never sold
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><Link href="/"><SafeMixLogo size={30} textSize="text-lg" /></Link></div>

          {error && (
            <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ── STEP: Profile ── */}
          {step === "profile" && (
            <>
              <div className="mb-7">
                <h1 className="font-manrope font-bold text-3xl text-[#1a2820] mb-2">Create your profile</h1>
                <p className="text-[#52615a]">Help the AI understand your baseline for accurate safety verdicts.</p>
              </div>

              <form onSubmit={handleProfileNext} className="space-y-5">
                {/* Role */}
                <div className="grid grid-cols-2 gap-3">
                  {roles.map((r) => (
                    <button key={r.id} type="button" onClick={() => setRole(r.id)}
                      className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${ role === r.id ? "border-[#5E7464] bg-[#f0f8f2] text-[#42594A] " : "border-[#e0e8e2] bg-white text-[#52615a] " }`}>
                      <span className="material-symbols-outlined mb-1">{r.icon}</span>
                      <span className="text-xs font-bold">{r.label}</span>
                      <span className="text-[10px] text-center opacity-70 mt-0.5">{r.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Full Name</label>
                  <input required type="text" placeholder="e.g. Ramesh Kumar" value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none focus:border-[#5E7464] focus:ring-2 focus:ring-[#5E7464]/20 transition-all text-sm" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Age</label>
                    <input required type="number" min="1" max="120" placeholder="e.g. 58" value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none focus:border-[#5E7464] transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Sex</label>
                    <select value={sex} onChange={(e) => setSex(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] focus:outline-none focus:border-[#5E7464] transition-all text-sm appearance-none">
                      <option value="prefer_not_to_say">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">Known Conditions (optional)</label>
                  <div className="flex flex-wrap gap-2">
                    {conditionsList.map((c) => (
                      <button key={c} type="button" onClick={() => toggleCondition(c)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${ conditions.includes(c) ? "bg-[#5E7464] text-white border-[#5E7464]" : "bg-white text-[#52615a] border-[#e0e8e2] " }`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Consent */}
                <div className="p-4 rounded-xl bg-[#f0f8f2] border border-[#b7eb8f]/30 flex gap-3 items-start">
                  <ShieldCheck className="w-5 h-5 text-[#5E7464] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[#52615a] leading-relaxed mb-2">
                      <strong className="text-[#1a2820]">DPDP Act 2023 Consent:</strong> We collect your age, sex, and health info strictly to calculate accurate medicine safety interactions. Your data is encrypted and never sold.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)}
                        className="w-4 h-4 rounded text-[#5E7464] focus:ring-[#5E7464]" />
                      <span className="text-xs font-semibold text-[#1a2820]">I agree to the secure processing of my health data.</span>
                    </label>
                  </div>
                </div>

                {/* Sign up with Google (shortcut) */}
                <button type="button" onClick={handleGoogle} disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] font-semibold text-sm hover:border-[#5E7464]/50 transition-all disabled:opacity-60">
                  {loading ? <div className="w-5 h-5 border-2 border-[#5E7464]/30 border-t-[#5E7464] rounded-full animate-spin" /> : <><GoogleIcon /> Sign up with Google</>}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#e0e8e2]" />
                  <span className="text-xs text-[#9ab0a0]">or use phone OTP</span>
                  <div className="flex-1 h-px bg-[#e0e8e2]" />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-xl transition-all hover:shadow-[0_8px_30px_rgba(94,116,100,0.35)] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                  <Phone className="w-4 h-4" /> Continue with Phone OTP <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <p className="text-center text-sm text-[#52615a] mt-6">
                Already have an account?{" "}
                <Link href="/login" className="text-[#5E7464] font-semibold hover:underline">Sign in</Link>
              </p>
            </>
          )}

          {/* ── STEP: Phone ── */}
          {step === "phone" && (
            <>
              <button onClick={() => { setStep("profile"); setError(""); }}
                className="flex items-center gap-1 text-sm text-[#7a9080] hover:text-[#5E7464] mb-6 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <div className="mb-8">
                <h1 className="font-manrope font-bold text-3xl text-[#1a2820] mb-2">Verify your number</h1>
                <p className="text-[#52615a]">We&apos;ll send a 6-digit OTP to this number.</p>
              </div>
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">Mobile Number</label>
                  <div className="flex rounded-xl border-2 border-[#e0e8e2] overflow-hidden focus-within:border-[#5E7464] focus-within:ring-2 focus-within:ring-[#5E7464]/20 transition-all">
                    <span className="px-4 py-3.5 bg-[#f0f8f2] text-[#5E7464] font-bold text-sm border-r border-[#e0e8e2] flex-shrink-0">+91</span>
                    <input type="tel" maxLength={10} placeholder="98765 43210" value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      className="flex-1 px-4 py-3.5 bg-white text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none text-sm" />
                  </div>
                </div>
                <button type="submit" disabled={loading || phone.length < 10}
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-xl disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><span>Send OTP</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}

          {/* ── STEP: OTP ── */}
          {step === "otp" && (
            <>
              <button onClick={() => { setStep("phone"); setError(""); setOtp(""); }}
                className="flex items-center gap-1 text-sm text-[#7a9080] hover:text-[#5E7464] mb-6 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Change number
              </button>
              <div className="mb-8">
                <h1 className="font-manrope font-bold text-3xl text-[#1a2820] mb-2">Enter OTP</h1>
                <p className="text-[#52615a]">
                  Code sent to <span className="font-semibold text-[#1a2820]">+91 {phone}</span>
                </p>
              </div>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <input type="text" inputMode="numeric" maxLength={6} placeholder="• • • • • •" value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none focus:border-[#5E7464] focus:ring-2 focus:ring-[#5E7464]/20 transition-all text-2xl tracking-[0.5em] text-center font-bold" />
                <button type="submit" disabled={loading || otp.length < 6}
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-xl disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><span>Verify &amp; Create Account</span><ArrowRight className="w-4 h-4" /></>}
                </button>
                <button type="button" onClick={handleSendOtp as any}
                  className="w-full text-center text-sm text-[#5E7464] font-semibold hover:underline py-2">Resend OTP</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
