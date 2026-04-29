"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SafeMixLogo from "@/components/ui/Logo";
import { ArrowRight, Phone, ShieldCheck, AlertCircle, ChevronLeft } from "lucide-react";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";

declare global {
  interface Window { recaptchaVerifier?: RecaptchaVerifier; }
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

type Step = "choose" | "phone" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [phone, setPhone]   = useState("");
  const [otp, setOtp]       = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  // Set up invisible reCAPTCHA once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result?.user) return;
        router.replace("/dashboard");
      } catch (e: any) {
        if (e?.code === "auth/popup-closed-by-user") {
          setError("Google sign-in was interrupted. Please try again.");
        } else if (e?.code === "auth/popup-blocked") {
          setError("Google popup was blocked by browser. Please try again.");
        } else if (e?.code) {
          setError(`Google sign-in failed (${e.code}).`);
        } else {
          setError("Google sign-in failed.");
        }
      }
    })();
  }, [router]);

  // ── Google Sign-In ──────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    const provider = new GoogleAuthProvider();
    const isMobile =
      typeof window !== "undefined" &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    try {
      if (isMobile) {
        await signInWithRedirect(auth, provider);
        return;
      }

      await signInWithPopup(auth, provider);
      router.replace("/dashboard");
    } catch (e: any) {
      if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/popup-blocked") {
        // Fallback to redirect for browsers that block or suppress popups.
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          setError(redirectErr?.message || "Google sign-in failed.");
        }
      } else {
        setError(e.message || "Google sign-in failed.");
      }
      setLoading(false);
    }
  };

  // ── Phone: Send OTP ─────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = digits.length === 10 ? `+91${digits}` : `+${digits}`;
      const verifier = window.recaptchaVerifier!;
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirm(result);
      setStep("otp");
    } catch (e: any) {
      setError(e.message || "Failed to send OTP. Check the number and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Phone: Verify OTP ───────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!confirm) return;
    setLoading(true);
    try {
      await confirm.confirm(otp);
      router.replace("/dashboard");
    } catch {
      setError("Invalid OTP. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F8F8F4]">

      {/* Hidden reCAPTCHA anchor */}
      <div id="recaptcha-container" ref={recaptchaRef} />

      {/* ── Left Panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] relative overflow-hidden p-12"
        style={{ background: "linear-gradient(145deg,#2d4035 0%,#1a2820 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-20 right-20 w-80 h-80 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle,#5E7464,transparent)" }} />
          <div className="absolute bottom-20 left-20 w-60 h-60 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle,#3B82F6,transparent)" }} />
        </div>

        <Link href="/"><SafeMixLogo size={36} textSize="text-xl" /></Link>

        <div className="relative z-10">
          <h2 className="font-manrope font-bold text-4xl text-white mb-5 leading-tight">
            Safer Medicine,<br />Smarter Decisions
          </h2>
          <p className="text-[#9ab0a0] text-lg mb-10 leading-relaxed">
            India&apos;s first AI safety layer for Allopathic + AYUSH medicines.
          </p>
          <div className="space-y-4">
            {[
              { icon: "fact_check",       text: "Red / Yellow / Green safety verdicts" },
              { icon: "qr_code_2",        text: "Share your regimen with doctors via QR" },
              { icon: "family_restroom",  text: "Manage medicines for your entire family" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#9ab0a0] text-base">{f.icon}</span>
                </div>
                <span className="text-[#c3d4c8] text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#7a9080]">
          <ShieldCheck className="w-4 h-4" />
          <span>DPDP Act 2023 compliant · Data never sold</span>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Link href="/"><SafeMixLogo size={32} textSize="text-lg" /></Link>
          </div>

          {/* ── STEP: Choose method ── */}
          {step === "choose" && (
            <>
              <div className="mb-8">
                <h1 className="font-manrope font-bold text-3xl text-[#1a2820] mb-2">Welcome back</h1>
                <p className="text-[#52615a]">Sign in to your SafeMix account</p>
              </div>

              {error && (
                <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                {/* Google */}
                <button onClick={handleGoogle} disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] font-semibold text-sm hover:border-[#5E7464]/50 hover:bg-[#f4f8f5] transition-all disabled:opacity-60">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-[#5E7464]/30 border-t-[#5E7464] rounded-full animate-spin" />
                  ) : (
                    <><GoogleIcon /> Continue with Google</>
                  )}
                </button>

                {/* Phone OTP */}
                <button onClick={() => { setError(""); setStep("phone"); }} disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] font-semibold text-sm hover:border-[#5E7464]/50 hover:bg-[#f4f8f5] transition-all disabled:opacity-60">
                  <Phone className="w-4 h-4 text-[#5E7464]" />
                  Continue with Phone OTP
                </button>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-[#f0f8f2] border border-[#b7eb8f]/30 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#5E7464] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#52615a]">
                  Your sign-in is secured by Firebase Authentication. We never store passwords.
                </p>
              </div>

              <p className="text-center text-sm text-[#52615a] mt-8">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="text-[#5E7464] font-semibold hover:underline">Create account</Link>
              </p>
            </>
          )}

          {/* ── STEP: Enter phone ── */}
          {step === "phone" && (
            <>
              <button onClick={() => { setStep("choose"); setError(""); }}
                className="flex items-center gap-1 text-sm text-[#7a9080] hover:text-[#5E7464] mb-6 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>

              <div className="mb-8">
                <h1 className="font-manrope font-bold text-3xl text-[#1a2820] mb-2">Enter your number</h1>
                <p className="text-[#52615a]">We&apos;ll send a 6-digit OTP to verify your identity.</p>
              </div>

              {error && (
                <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">
                    Mobile Number
                  </label>
                  <div className="flex rounded-xl border-2 border-[#e0e8e2] overflow-hidden focus-within:border-[#5E7464] focus-within:ring-2 focus-within:ring-[#5E7464]/20 transition-all">
                    <span className="px-4 py-3.5 bg-[#f0f8f2] text-[#5E7464] font-bold text-sm border-r border-[#e0e8e2] flex-shrink-0">
                      +91
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      className="flex-1 px-4 py-3.5 bg-white text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none text-sm"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading || phone.length < 10}
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-xl transition-all hover:shadow-[0_8px_30px_rgba(94,116,100,0.35)] active:scale-[0.99] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><span>Send OTP</span><ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </>
          )}

          {/* ── STEP: Enter OTP ── */}
          {step === "otp" && (
            <>
              <button onClick={() => { setStep("phone"); setError(""); setOtp(""); }}
                className="flex items-center gap-1 text-sm text-[#7a9080] hover:text-[#5E7464] mb-6 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Change number
              </button>

              <div className="mb-8">
                <h1 className="font-manrope font-bold text-3xl text-[#1a2820] mb-2">Enter OTP</h1>
                <p className="text-[#52615a]">
                  6-digit code sent to <span className="font-semibold text-[#1a2820]">+91 {phone}</span>
                </p>
              </div>

              {error && (
                <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">
                    6-Digit OTP
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-[#e0e8e2] bg-white text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none focus:border-[#5E7464] focus:ring-2 focus:ring-[#5E7464]/20 transition-all text-2xl tracking-[0.5em] text-center font-bold"
                  />
                </div>

                <button type="submit" disabled={loading || otp.length < 6}
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-xl transition-all hover:shadow-[0_8px_30px_rgba(94,116,100,0.35)] active:scale-[0.99] disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><span>Verify &amp; Sign In</span><ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <button type="button" onClick={handleSendOtp as any}
                  className="w-full text-center text-sm text-[#5E7464] font-semibold hover:underline py-2">
                  Resend OTP
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
