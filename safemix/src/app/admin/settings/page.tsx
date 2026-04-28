"use client";
/**
 * Admin module 6 — Feature flags & runtime settings (PRD §8.3 m6).
 *
 * Stored as a single `settings/runtime` document. The app reads these in
 * client code via getFlag(...). PRD calls for Firebase Remote Config — this
 * Firestore-backed shim keeps everything in one place until we wire RC.
 */
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Settings, Save, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase/config";

interface Flags {
  voice_input_enabled: boolean;
  ocr_camera_enabled: boolean;
  family_profiles_enabled: boolean;
  ai_assistant_enabled: boolean;
  doctor_share_enabled: boolean;
  insurer_dashboard_enabled: boolean;
  /** Per-language enablement (PRD §11 day-90 plan rollout) */
  enabled_languages: string[];
  /** Override which Gemini variant to route a task to. */
  model_overrides: Record<string, string>;
  /** REVIEW_CONFIDENCE_FLOOR override (default 0.85) */
  review_confidence_floor: number;
  /** Feature kill-switch */
  emergency_kill_switch: boolean;
}

const DEFAULTS: Flags = {
  voice_input_enabled: true,
  ocr_camera_enabled: true,
  family_profiles_enabled: true,
  ai_assistant_enabled: true,
  doctor_share_enabled: true,
  insurer_dashboard_enabled: false,
  enabled_languages: ["en", "hi"],
  model_overrides: {},
  review_confidence_floor: 0.85,
  emergency_kill_switch: false,
};

export default function AdminSettingsPage() {
  const [flags, setFlags] = useState<Flags>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<string>("");
  const [cleanupDays, setCleanupDays] = useState(7);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "runtime"));
        if (snap.exists()) setFlags({ ...DEFAULTS, ...(snap.data() as Partial<Flags>) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "runtime"), flags);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const replayQueuedConsents = async () => {
    setReplaying(true);
    setReplayResult("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Login required");
      const token = await user.getIdToken();
      const res = await fetch("/api/abdm/consent/replay", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Replay failed");
      setReplayResult(`Processed ${json.total} queued requests: ${json.success} sent, ${json.failed} failed.`);
    } catch (e) {
      setReplayResult((e as Error).message);
    } finally {
      setReplaying(false);
    }
  };

  const cleanupAbdmOps = async () => {
    setCleaning(true);
    setCleanupResult("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Login required");
      const token = await user.getIdToken();
      const res = await fetch("/api/abdm/ops/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ olderThanDays: cleanupDays }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cleanup failed");
      setCleanupResult(`Marked stale queue: ${json.queueUpdated}, replay-guard deleted: ${json.replayDeleted}`);
    } catch (e) {
      setCleanupResult((e as Error).message);
    } finally {
      setCleaning(false);
    }
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin text-[#5E7464]" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-manrope font-bold text-2xl text-[#1a2820] flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#5E7464]" /> Feature Flags
        </h1>
        <p className="text-sm text-[#7a9080] mt-0.5">
          Runtime feature toggles, model routing overrides, and the emergency kill switch. PRD §8.3 m6.
        </p>
      </div>

      <div className="bg-white border border-[#e0e8e2] rounded-2xl p-5 space-y-4">
        {(["voice_input_enabled", "ocr_camera_enabled", "family_profiles_enabled", "ai_assistant_enabled", "doctor_share_enabled", "insurer_dashboard_enabled"] as const).map((k) => (
          <Toggle key={k} label={prettify(k)} value={flags[k]} onChange={(v) => setFlags({ ...flags, [k]: v })} />
        ))}
        <Toggle
          label="Emergency kill switch (disables every AI feature globally)"
          value={flags.emergency_kill_switch}
          onChange={(v) => setFlags({ ...flags, emergency_kill_switch: v })}
          danger
        />
      </div>

      <div className="bg-white border border-[#e0e8e2] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[#1a2820] text-sm">Review confidence floor</h3>
        <p className="text-xs text-[#7a9080]">Outputs below this threshold route to the AI Review Queue. Default 0.85.</p>
        <input
          type="number"
          step="0.01"
          min="0.5"
          max="1"
          value={flags.review_confidence_floor}
          onChange={(e) => setFlags({ ...flags, review_confidence_floor: Number(e.target.value) })}
          className="w-32 px-3 py-2 rounded-xl border border-[#e0e8e2] text-sm"
        />
      </div>

      <div className="bg-white border border-[#e0e8e2] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[#1a2820] text-sm">Enabled languages</h3>
        <p className="text-xs text-[#7a9080]">Comma-separated ISO codes. The picker shows all 12, but only enabled codes drive prompt routing.</p>
        <input
          value={flags.enabled_languages.join(",")}
          onChange={(e) => setFlags({ ...flags, enabled_languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          className="w-full px-3 py-2 rounded-xl border border-[#e0e8e2] text-sm"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-5 py-2.5 rounded-xl bg-[#42594A] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : "Save flags"}
      </button>
      {savedAt && <p className="text-xs text-[#42594A]">Saved {new Date(savedAt).toLocaleTimeString("en-IN")}.</p>}

      <div className="bg-white border border-[#e0e8e2] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[#1a2820] text-sm">ABDM Offline Queue Replay</h3>
        <p className="text-xs text-[#7a9080]">Resend queued consent requests (`local_requested`) after gateway credentials are configured.</p>
        <button
          onClick={replayQueuedConsents}
          disabled={replaying}
          className="px-4 py-2 rounded-xl bg-[#42594A] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          {replaying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {replaying ? "Replaying..." : "Replay queued consents"}
        </button>
        {replayResult && <p className="text-xs text-[#42594A]">{replayResult}</p>}
      </div>

      <div className="bg-white border border-[#e0e8e2] rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-[#1a2820] text-sm">ABDM Ops Cleanup</h3>
        <p className="text-xs text-[#7a9080]">Marks very old local queue entries as stale and deletes old replay-guard keys.</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={365}
            value={cleanupDays}
            onChange={(e) => setCleanupDays(Number(e.target.value) || 7)}
            className="w-24 px-3 py-2 rounded-xl border border-[#e0e8e2] text-sm"
          />
          <button
            onClick={cleanupAbdmOps}
            disabled={cleaning}
            className="px-4 py-2 rounded-xl bg-[#42594A] text-white text-sm font-semibold disabled:opacity-50"
          >
            {cleaning ? "Cleaning..." : "Run cleanup"}
          </button>
        </div>
        {cleanupResult && <p className="text-xs text-[#42594A]">{cleanupResult}</p>}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, danger }: { label: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className={`text-sm ${danger ? "text-red-700 font-semibold" : "text-[#1a2820]"}`}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full relative transition-colors ${value ? (danger ? "bg-red-500" : "bg-[#5E7464]") : "bg-[#e0e8e2]"}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-7" : "translate-x-1"}`} />
      </button>
    </label>
  );
}

function prettify(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
