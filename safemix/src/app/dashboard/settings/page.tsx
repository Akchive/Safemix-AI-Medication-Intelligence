"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import Link from "next/link";
import {
  User, Bell, Shield, Globe, Eye, Type, Clock, LogOut,
  Smartphone, Trash2, Heart, Download, Loader2, Check, AlertTriangle,
} from "lucide-react";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { LANGUAGES, useT, type LangCode } from "@/lib/i18n";
import { exportUserData, deleteUserAccount } from "@/app/actions/dpdp";
import { deleteUser } from "firebase/auth";

const sections = [
  { id: "account",       label: "Account Settings", icon: User },
  { id: "notifications", label: "Notifications",     icon: Bell },
  { id: "family",        label: "Family Profiles",   icon: Heart },
  { id: "display",       label: "Display",           icon: Eye },
  { id: "language",      label: "Language",          icon: Globe },
  { id: "privacy",       label: "Privacy & Consent", icon: Shield },
];

export default function SettingsPage() {
  const [active, setActive] = useState("account");
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useT();

  const inputCls = "w-full px-4 py-3 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:border-[#5E7464] focus:ring-1 focus:ring-[#5E7464] outline-none";

  return (
    <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8">

      {/* Sidebar Nav */}
      <div className="w-full md:w-64 flex-shrink-0 space-y-1">
        <h1 className="font-manrope font-bold text-2xl text-[#1a2820] mb-6">Settings</h1>
        {sections.map((s) => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${ active === s.id ? "bg-[#42594A] text-white shadow-lg" : "text-[#52615a] hover:bg-white hover:shadow-sm" }`}>
            <s.icon className={`w-4 h-4 ${active === s.id ? "text-white" : "text-[#9ab0a0]"}`} />
            {s.label}
          </button>
        ))}
        <div className="pt-4 mt-4 border-t border-[#e0e8e2]">
          <button
            onClick={async () => { await logout(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        <div className="bg-white rounded-3xl border border-[#e0e8e2] p-6 md:p-8">

          {/* ── Account ── */}
          {active === "account" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-[30px] bg-[#5E7464] flex items-center justify-center text-2xl font-bold text-white shadow-xl">
                  {(user?.displayName?.[0] || user?.phoneNumber?.replace(/\D/g, "")?.slice(-1) || "U").toUpperCase()}
                </div>
                <div>
                  <h2 className="font-manrope font-bold text-xl text-[#1a2820]">{user?.displayName || user?.phoneNumber || "User"}</h2>
                  <p className="text-sm text-[#7a9080]">{user?.email || user?.phoneNumber || "—"}</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Full Name">
                  <input type="text" defaultValue={user?.displayName ?? ""} className={inputCls} />
                </Field>
                <Field label="Email Address">
                  <input type="email" defaultValue={user?.email ?? ""} className={inputCls} />
                </Field>
                <Field label="Phone Number">
                  <input type="tel" defaultValue={user?.phoneNumber ?? ""} className={inputCls} disabled />
                </Field>
                <Field label="Blood Group">
                  <select className={inputCls}>
                    {["—", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((g) => <option key={g}>{g}</option>)}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-[#9ab0a0]">Profile editing wires up to Firestore in the family-profile flow ({" "}
                <Link href="/dashboard/family" className="underline">Manage profiles</Link>).
              </p>
            </div>
          )}

          {/* ── Notifications ── */}
          {active === "notifications" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="font-manrope font-bold text-xl text-[#1a2820] mb-6">Notification Preferences</h2>
              <div className="space-y-4">
                {[
                  { title: "Medication Reminders", desc: "Push notification when it's time to take your dose.", icon: Bell },
                  { title: "Safety Alerts",        desc: "Instant alert when a dangerous interaction is detected.", icon: Shield },
                  { title: "Missed Dose Warnings", desc: "Notify you if a dose wasn't logged within 30 minutes.", icon: Clock },
                  { title: "Doctor Portal Access", desc: "Notify you when a doctor reviews your shared profile.", icon: Smartphone },
                ].map((item) => (
                  <div key={item.title} className="flex items-center justify-between p-4 rounded-2xl bg-[#F8F8F4] border border-[#e0e8e2]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#5E7464] shadow-sm">
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1a2820]">{item.title}</p>
                        <p className="text-[11px] text-[#7a9080]">{item.desc}</p>
                      </div>
                    </div>
                    <div className="w-10 h-5 bg-[#5E7464] rounded-full relative cursor-pointer">
                      <div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full shadow-sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Family ── shortcut to the dedicated page */}
          {active === "family" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 text-center py-10">
              <Heart className="w-12 h-12 text-[#5E7464] mx-auto" />
              <h2 className="font-manrope font-bold text-xl text-[#1a2820]">Family Profiles</h2>
              <p className="text-sm text-[#7a9080] max-w-sm mx-auto">
                Manage up to 6 dependents with per-profile consent PINs. Each profile keeps its own regimen and verdicts.
              </p>
              <Link href="/dashboard/family" className="inline-flex items-center gap-2 px-6 py-3 bg-[#42594A] text-white text-sm font-semibold rounded-2xl shadow-md hover:shadow-lg">
                Manage Family Profiles
              </Link>
            </div>
          )}

          {/* ── Display ── */}
          {active === "display" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="font-manrope font-bold text-xl text-[#1a2820] mb-6">Display & Accessibility</h2>
              <Field label="Font Size">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#F8F8F4] border border-[#e0e8e2]">
                  <Type className="w-4 h-4 text-[#9ab0a0]" />
                  <input type="range" className="flex-1 accent-[#5E7464]" min="0" max="100" defaultValue="40" />
                  <Type className="w-6 h-6 text-[#1a2820]" />
                </div>
              </Field>
              <p className="text-xs text-[#9ab0a0]">SafeMix is light-mode by design — high contrast for senior users.</p>
            </div>
          )}

          {/* ── Language ── real i18n picker */}
          {active === "language" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="font-manrope font-bold text-xl text-[#1a2820] mb-2">App Language</h2>
              <p className="text-sm text-[#7a9080] mb-4">Pick the language you want SafeMix to speak in. Verdict explanations also use this language.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {LANGUAGES.map((l) => {
                  const active = l.code === lang;
                  return (
                    <button
                      key={l.code}
                      onClick={() => setLang(l.code as LangCode)}
                      className={`p-4 rounded-2xl border text-sm font-bold transition-all flex flex-col items-start ${
                        active ? "border-[#5E7464] bg-[#f0f8f2] text-[#42594A]" : "border-[#e0e8e2] bg-[#F8F8F4] text-[#52615a] hover:border-[#5E7464]/40"
                      }`}
                    >
                      <span>{l.native}</span>
                      <span className="text-[10px] uppercase tracking-wider text-[#9ab0a0] font-semibold mt-1">{l.label}</span>
                      {active && <Check className="w-3 h-3 text-[#5E7464] mt-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Privacy & Consent (DPDP rights) ── */}
          {active === "privacy" && (
            <PrivacyPanel
              uid={user?.uid ?? null}
              onAccountDeleted={async () => {
                if (user) {
                  try {
                    await deleteUser(user);
                  } catch {
                    // Auth requires a recent login; either way, sign out.
                  }
                }
                await logout();
                router.replace("/");
              }}
            />
          )}

        </div>

        {/* Support Banner */}
        <div className="bg-gradient-to-br from-[#F8F8F4] to-[#e8ede9] rounded-3xl border border-[#e0e8e2] p-6 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-[#1a2820] text-sm">Need help?</h4>
            <p className="text-xs text-[#7a9080]">Our clinical support team is here for you.</p>
          </div>
          <Link href="/contact" className="px-4 py-2 bg-white rounded-xl text-xs font-bold text-[#42594A] shadow-sm hover:shadow-md transition-all border border-[#e0e8e2]">
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">{label}</label>
      {children}
    </div>
  );
}

function PrivacyPanel({ uid, onAccountDeleted }: { uid: string | null; onAccountDeleted: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [abdmLoading, setAbdmLoading] = useState(false);
  const [abdmError, setAbdmError] = useState<string | null>(null);
  const [abdmItems, setAbdmItems] = useState<Array<Record<string, any>>>([]);
  const [abdmWarning, setAbdmWarning] = useState<string | null>(null);
  const [fhirLoading, setFhirLoading] = useState(false);
  const [fhirMsg, setFhirMsg] = useState<string | null>(null);

  const handleExport = async () => {
    if (!uid) return;
    setExporting(true);
    setExportError(null);
    try {
      const archive = await exportUserData(uid);
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safemix-export-${uid.slice(0, 8)}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent(AnalyticsEvents.DATA_EXPORTED);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!uid) return;
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserAccount(uid);
      trackEvent(AnalyticsEvents.ACCOUNT_DELETED);
      // Best-effort: also clear local caches.
      if (typeof window !== "undefined") {
        ["safemix_regimen", "safemix_interaction_cache", "safemix_dependents", "safemix_family_profiles", "safemix_active_profile", "safemix_revoked_tokens"]
          .forEach((k) => localStorage.removeItem(k));
      }
      await onAccountDeleted();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const refreshAbdm = async () => {
    if (!uid) return;
    setAbdmError(null);
    const res = await fetch(`/api/abdm/consent/list?uid=${encodeURIComponent(uid)}`, { method: "GET" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load ABDM consents");
    setAbdmItems(json.items ?? []);
  };

  const handleAbdmConsentRequest = async () => {
    if (!uid) return;
    setAbdmLoading(true);
    setAbdmError(null);
    setAbdmWarning(null);
    try {
      const res = await fetch("/api/abdm/consent/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          purpose: "medication_safety",
          hiTypes: ["Prescription", "DiagnosticReport"],
          days: 180,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to request consent");
      if (json.warning) setAbdmWarning(String(json.warning));
      await refreshAbdm();
    } catch (e) {
      setAbdmError((e as Error).message);
    } finally {
      setAbdmLoading(false);
    }
  };

  const handleFhirExport = async () => {
    if (!uid) return;
    setFhirLoading(true);
    setFhirMsg(null);
    try {
      const res = await fetch(`/api/fhir/export?uid=${encodeURIComponent(uid)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "FHIR export failed");
      const blob = new Blob([JSON.stringify(json.bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safemix-fhir-export-${uid.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFhirMsg("FHIR export downloaded.");
    } catch (e) {
      setFhirMsg((e as Error).message);
    } finally {
      setFhirLoading(false);
    }
  };

  const handleFhirImport = async (file?: File | null) => {
    if (!uid || !file) return;
    setFhirLoading(true);
    setFhirMsg(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const res = await fetch("/api/fhir/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, bundle }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "FHIR import failed");
      setFhirMsg(`FHIR import complete: ${json.imported} medicines mapped.`);
    } catch (e) {
      setFhirMsg((e as Error).message);
    } finally {
      setFhirLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <h2 className="font-manrope font-bold text-xl text-[#1a2820]">Privacy & Consent</h2>
        <p className="text-sm text-[#7a9080] mt-1">
          Under the DPDP Act, you have the right to a copy of your data and the right to erasure. SafeMix fulfils both within 30 days of request.
        </p>
      </div>

      {/* Export */}
      <div className="rounded-2xl border border-[#e0e8e2] bg-[#F8F8F4] p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#1a2820]">ABDM Consent</h3>
            <p className="text-xs text-[#7a9080] mt-0.5">
              Request ABDM consent for medication safety import/export. Status updates appear below.
            </p>
          </div>
          <button
            onClick={handleAbdmConsentRequest}
            disabled={!uid || abdmLoading}
            className="px-4 py-2.5 rounded-xl bg-[#42594A] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {abdmLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {abdmLoading ? "Requesting..." : "Request Consent"}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={refreshAbdm} className="px-3 py-1.5 rounded-lg text-xs border border-[#d7e0d9] bg-white">Refresh status</button>
        </div>
        {abdmError && <p className="text-xs text-red-600">{abdmError}</p>}
        {abdmWarning && <p className="text-xs text-amber-700">{abdmWarning}</p>}
        {abdmItems.length > 0 && (
          <div className="space-y-2">
            {abdmItems.slice(0, 5).map((it) => (
              <div key={String(it.id)} className="p-2 rounded-lg border border-[#e0e8e2] bg-white text-xs">
                <p className="font-semibold text-[#1a2820]">{String(it.purpose ?? "consent")} · {String(it.status ?? "requested")}</p>
                <p className="text-[#7a9080]">ID: {String(it.id)} {it.createdAt ? `· ${new Date(Number(it.createdAt)).toLocaleString()}` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#e0e8e2] bg-[#F8F8F4] p-5 space-y-3">
        <div>
          <h3 className="font-bold text-[#1a2820]">FHIR Import / Export (Mock)</h3>
          <p className="text-xs text-[#7a9080] mt-0.5">Use this until ABDM live credentials are available.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleFhirExport} disabled={!uid || fhirLoading} className="px-4 py-2 rounded-xl bg-[#42594A] text-white text-sm font-semibold disabled:opacity-50">
            {fhirLoading ? "Working..." : "Download FHIR Export"}
          </button>
          <label className="px-4 py-2 rounded-xl border border-[#d7e0d9] bg-white text-sm font-semibold cursor-pointer">
            Upload FHIR Bundle
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => handleFhirImport(e.target.files?.[0])}
            />
          </label>
        </div>
        {fhirMsg && <p className="text-xs text-[#42594A]">{fhirMsg}</p>}
      </div>

      {/* Export */}
      <div className="rounded-2xl border border-[#e0e8e2] bg-[#F8F8F4] p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#1a2820]">Export My Data</h3>
            <p className="text-xs text-[#7a9080] mt-0.5">
              Download a JSON archive of every collection under your account: medications, verdicts, reminders, shares, profiles, adverse events.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={!uid || exporting}
            className="px-4 py-2.5 rounded-xl bg-[#42594A] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Preparing…" : "Download archive"}
          </button>
        </div>
        {exportError && <p className="text-xs text-red-600">{exportError}</p>}
      </div>

      {/* Delete */}
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-red-700">Delete Account</h3>
            <p className="text-xs text-red-600 mt-0.5">
              Permanently erases your regimen, verdicts, reminders, family profiles, and shares. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="flex-1 px-4 py-2.5 rounded-xl border border-red-200 bg-white text-sm text-[#1a2820] outline-none focus:border-red-400"
          />
          <button
            onClick={handleDelete}
            disabled={!uid || deleting || confirmText.trim().toUpperCase() !== "DELETE"}
            className="px-5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            {deleting ? "Erasing…" : "Delete account"}
          </button>
        </div>
        {deleteError && <p className="text-xs text-red-700">{deleteError}</p>}
      </div>
    </div>
  );
}
