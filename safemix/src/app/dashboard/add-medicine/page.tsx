"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search, Mic, Camera, Clock, AlertTriangle, CheckCircle, AlertCircle,
  Loader2, Sparkles, X, ScanLine, ImageIcon, MicOff, Trash2, Plus,
} from "lucide-react";
import { checkInteraction, type InteractionResult } from "@/app/actions/checkInteraction";
import { findAlternatives, type AlternativeOption } from "@/app/actions/findAlternatives";
import { extractMedicineData, type OcrExtractedData } from "@/app/actions/ocr";
import { parseVoiceInput, type ParsedMedicineFields } from "@/app/actions/parseVoice";
import CameraScanner from "@/components/ui/CameraScanner";
import { searchMedicines, type MedicineSuggestion } from "@/lib/medicineList";
import { saveVerdict } from "@/lib/interactionCache";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import {
  getRegimen, addToRegimen, removeFromRegimen, getRegimenNames,
  type RegimenMedicine,
} from "@/lib/regimen";
import { useAuth } from "@/components/providers/AuthProvider";

// ─── Constants ────────────────────────────────────────────────────────────────
const SYSTEMS = ["Allopathic", "Ayurvedic", "Homeopathic", "Herbal / Plant-based", "OTC", "Home Remedy", "Supplement"];
const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "Every 8 hours", "Every 12 hours", "As needed"];
const TIMINGS = ["Morning (empty stomach)", "Morning (after meal)", "Afternoon (after meal)", "Evening", "Night (before bed)", "Night (after meal)"];

const systemColor: Record<string, string> = {
  "Allopathic": "#3B82F6", "Ayurvedic": "#10B981", "Herbal / Plant-based": "#8B5CF6",
  "OTC": "#F59E0B", "Supplement": "#06B6D4", "Home Remedy": "#EC4899", "Homeopathic": "#6366F1",
};

const verdictConfig = {
  red: { bg: "#FFF1F0", border: "#FFCCC7", text: "#C41C00", iconBg: "#FFCCC7", icon: AlertTriangle, label: "SEVERE RISK" },
  yellow: { bg: "#FFFBE6", border: "#FFE58F", text: "#875400", iconBg: "#FFE58F", icon: AlertCircle, label: "CAUTION" },
  green: { bg: "#F6FFED", border: "#B7EB8F", text: "#237804", iconBg: "#B7EB8F", icon: CheckCircle, label: "SAFE TO ADD" },
};

const VOICE_LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "mr-IN", label: "मराठी" },
];

const EMPTY_FORM = { name: "", system: "", dosage: "", frequency: "", timing: "", withFood: true, startDate: "" };

// ─── Component ────────────────────────────────────────────────────────────────
export default function AddMedicinePage() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [tab, setTab] = useState<"search" | "ocr" | "voice" | "past">("search");
  const [form, setForm] = useState(EMPTY_FORM);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<InteractionResult | null>(null);
  const [error, setError] = useState("");
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [findingAlternatives, setFindingAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<AlternativeOption[]>([]);
  const [alternativesSummary, setAlternativesSummary] = useState("");
  const [alternativesWarning, setAlternativesWarning] = useState("");

  // ── Dynamic regimen from localStorage ──────────────────────────────────────
  const [regimen, setRegimen] = useState<RegimenMedicine[]>([]);
  useEffect(() => {
    // Clear old seeded data if it still contains the hardcoded default IDs
    const raw = localStorage.getItem("safemix_regimen");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as RegimenMedicine[];
        const isSeeded = parsed.some((m) => ["m1", "m2", "m3", "m4"].includes(m.id));
        if (isSeeded) {
          localStorage.removeItem("safemix_regimen");
        }
      } catch { /* ignore */ }
    }
    setRegimen(getRegimen());
  }, []);

  const regimenNames = regimen.map((m) => m.name);

  // ── Autocomplete ─────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<MedicineSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSugg, setActiveSugg] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // ── OCR ──────────────────────────────────────────────────────────────────
  const [showCamera, setShowCamera] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrExtractedData | null>(null);
  const [ocrError, setOcrError] = useState("");

  // ── Voice ────────────────────────────────────────────────────────────────
  const [voiceLang, setVoiceLang] = useState("en-IN");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceParsing, setVoiceParsing] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceReady, setVoiceReady] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Check browser support
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceReady(!!SR);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (tab !== "search") { setSuggestions([]); setShowSuggestions(false); }
  }, [tab]);

  // ── Helper: apply any parsed fields to form ─────────────────────────────
  const applyFields = useCallback((fields: Partial<typeof EMPTY_FORM>) => {
    setForm((f) => ({
      ...f,
      name: fields.name || f.name,
      system: fields.system || f.system,
      dosage: fields.dosage || f.dosage,
      frequency: fields.frequency || f.frequency,
      timing: fields.timing || f.timing,
      withFood: typeof fields.withFood === "boolean" ? fields.withFood : f.withFood,
      startDate: fields.startDate || f.startDate,
    }));
    setResult(null);
    setError("");
  }, []);

  // ── Autocomplete handlers ─────────────────────────────────────────────
  const handleNameChange = (val: string) => {
    setForm({ ...form, name: val });
    const results = searchMedicines(val);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
    setActiveSugg(-1);
    setResult(null);
    setError("");
  };

  const pickSuggestion = (s: MedicineSuggestion) => {
    setForm({ ...form, name: s.name, system: s.system });
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveSugg((p) => Math.min(p + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveSugg((p) => Math.max(p - 1, -1)); }
    else if (e.key === "Enter" && activeSugg >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeSugg]); }
    else if (e.key === "Escape") setShowSuggestions(false);
  };

  // ── OCR ─────────────────────────────────────────────────────────────────
  const handleOcrCapture = async (base64Image: string) => {
    setShowCamera(false);
    setOcrLoading(true);
    setOcrPreview(base64Image);
    setOcrError("");
    setOcrResult(null);
    try {
      const data = await extractMedicineData(base64Image);
      setOcrResult(data);
    } catch (err: any) {
      setOcrError(err.message || "Could not extract medicine data from image.");
    } finally {
      setOcrLoading(false);
    }
  };

  const applyOcrResult = () => {
    if (!ocrResult) return;
    applyFields({
      name: ocrResult.name,
      system: ocrResult.system,
      dosage: ocrResult.dosage,
      frequency: ocrResult.frequency,
      timing: ocrResult.timing,
      withFood: ocrResult.withFood,
    });
    setTab("search");
    setOcrPreview(null);
    setOcrResult(null);
    const results = searchMedicines(ocrResult.name);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── Voice ────────────────────────────────────────────────────────────────
  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceError("Speech recognition not supported in this browser. Try Chrome."); return; }

    setVoiceError("");
    setTranscript("");
    setInterimTranscript("");
    setVoiceParsing(false);

    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = voiceLang;
    recognition.maxAlternatives = 1;

    setListening(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) setTranscript((prev) => (prev + " " + final).trim());
      setInterimTranscript(interim);
    };

    recognition.onerror = (e: any) => {
      setListening(false);
      if (e.error === "no-speech") setVoiceError("No speech detected. Please try again.");
      else if (e.error === "not-allowed") setVoiceError("Microphone permission denied. Allow mic access in browser settings.");
      else setVoiceError(`Error: ${e.error}`);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };

    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const parseTranscript = async () => {
    const text = (transcript + " " + interimTranscript).trim();
    if (!text) return;
    setVoiceParsing(true);
    setVoiceError("");
    try {
      const parsed = await parseVoiceInput(text);
      applyFields(parsed);
      setTab("search");
      if (parsed.name) {
        const results = searchMedicines(parsed.name);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      setTranscript("");
    } catch (err: any) {
      setVoiceError(err.message || "Could not parse voice input.");
    } finally {
      setVoiceParsing(false);
    }
  };

  // ── Interaction Check ─────────────────────────────────────────────────────
  const runCheck = async () => {
    if (!form.name.trim()) { setError("Please enter a medicine name first."); return; }
    setChecking(true);
    setResult(null);
    setAlternatives([]);
    setAlternativesSummary("");
    setAlternativesWarning("");
    setError("");
    try {
      const data = await checkInteraction(form.name.trim(), form.system || "Unknown system", regimenNames);
      setResult(data);
      saveVerdict({
        medicine: form.name.trim(),
        system: form.system || "Unknown",
        verdict: data.verdict,
        medicines: data.medicines,
        reason: data.reason,
        suggestion: data.suggestion,
        confidence: data.confidence,
        source: data.source,
      }, uid);
      await trackEvent(AnalyticsEvents.INTERACTION_CHECK, { verdict: data.verdict, medicine: form.name.trim() });
    } catch (err: any) {
      setError(err.message || "Failed to check interactions. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  // ── Add to Regimen ────────────────────────────────────────────────────────
  const handleAddToRegimen = () => {
    if (!form.name.trim()) return;
    addToRegimen({
      name: form.name, system: form.system, dosage: form.dosage,
      frequency: form.frequency, timing: form.timing,
      withFood: form.withFood, startDate: form.startDate,
    }, uid);
    setRegimen(getRegimen());
    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      setForm(EMPTY_FORM);
      setResult(null);
    }, 2000);
  };

  const handleRemoveFromRegimen = (id: string) => {
    removeFromRegimen(id, uid);
    setRegimen(getRegimen());
  };

  const handleFindAlternatives = async () => {
    if (!result || !form.name.trim()) return;
    setFindingAlternatives(true);
    setAlternatives([]);
    setAlternativesSummary("");
    setAlternativesWarning("");
    await trackEvent(AnalyticsEvents.ALTERNATIVES_CLICKED, { verdict: result.verdict, medicine: form.name.trim() });

    try {
      const out = await findAlternatives(form.name.trim(), form.system || "Unknown system", regimenNames);
      setAlternatives(out.alternatives);
      setAlternativesSummary(out.summary);
      setAlternativesWarning(out.warning ?? "");

      if (out.alternatives.length > 0) {
        await trackEvent(AnalyticsEvents.ALTERNATIVES_SUCCESS, { count: out.alternatives.length, medicine: form.name.trim() });
      } else if (out.warning) {
        await trackEvent(AnalyticsEvents.ALTERNATIVES_FALLBACK, { medicine: form.name.trim() });
      } else {
        await trackEvent(AnalyticsEvents.ALTERNATIVES_FAILED, { medicine: form.name.trim() });
      }
    } catch {
      setAlternatives([]);
      setAlternativesSummary("Could not fetch alternatives right now.");
      setAlternativesWarning("Please consult your doctor/pharmacist before changing medicines.");
      await trackEvent(AnalyticsEvents.ALTERNATIVES_FAILED, { medicine: form.name.trim() });
    } finally {
      setFindingAlternatives(false);
    }
  };

  // ─────────────────────────────────────────── Render ──────────────────────
  const tabs = [
    { id: "search" as const, label: "Text Search", icon: Search },
    { id: "ocr" as const, label: "OCR Scan", icon: Camera },
    { id: "voice" as const, label: "Voice", icon: Mic },
    { id: "past" as const, label: "History", icon: Clock },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-manrope font-bold text-2xl text-[#1a2820]">Add Medicine</h1>
        <p className="text-sm text-[#7a9080] mt-1">Add via text, camera scan, or voice — Gemini AI fills all fields automatically.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#f0f5f1] rounded-2xl">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setResult(null); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${ tab === t.id ? "bg-white text-[#42594A] shadow-sm" : "text-[#7a9080] hover:text-[#42594A]" }`}>
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Main Card ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#e0e8e2] p-6 space-y-5">

        {/* ══ Text Search with Autocomplete ══════════════════════════════════ */}
        {tab === "search" && (
          <div className="relative">
            <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">Medicine Name *</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ab0a0] pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. Metformin, Ashwagandha, Karela Juice…"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="w-full pl-11 pr-10 py-3 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] placeholder-[#9ab0a0] focus:outline-none focus:border-[#5E7464] focus:ring-2 focus:ring-[#5E7464]/20 text-sm"
              />
              {form.name && (
                <button onClick={() => { setForm({ ...form, name: "", system: "" }); setSuggestions([]); setShowSuggestions(false); setResult(null); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ab0a0] hover:text-[#52615a]">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-[#e0e8e2] shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                {suggestions.map((s, i) => (
                  <button key={s.name} onMouseDown={() => pickSuggestion(s)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${ i === activeSugg ? "bg-[#f0f8f2] " : "hover:bg-[#f8faf8] " } ${i !== suggestions.length - 1 ? "border-b border-[#f0f4f1] " : ""}`}>
                    <div>
                      <p className="text-sm font-semibold text-[#1a2820]">{s.name}</p>
                      <p className="text-xs text-[#9ab0a0]">{s.commonUse}</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full ml-3 flex-shrink-0"
                      style={{ background: `${systemColor[s.system] || "#9ab0a0"}18`, color: systemColor[s.system] || "#9ab0a0" }}>
                      {s.system}
                    </span>
                  </button>
                ))}
                <div className="px-4 py-2 bg-[#f8faf8] border-t border-[#f0f4f1]">
                  <p className="text-[10px] text-[#9ab0a0]">↑↓ navigate · Enter to pick · Esc to close</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ OCR Tab — Inline Camera ══════════════════════════════════════ */}
        {tab === "ocr" && (
          <div className="space-y-4">
            {!ocrPreview && !ocrLoading && (
              <>
                <div onClick={() => { setOcrError(""); setShowCamera(true); }}
                  className="border-2 border-dashed border-[#c3d4c8] rounded-2xl p-10 text-center hover:border-[#5E7464] transition-colors cursor-pointer group">
                  <div className="w-16 h-16 rounded-2xl bg-[#f0f8f2] flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                    <Camera className="w-8 h-8 text-[#5E7464]" />
                  </div>
                  <p className="font-semibold text-[#1a2820] mb-1">Open Camera</p>
                  <p className="text-sm text-[#7a9080]">Point at a medicine strip, box, or prescription.<br />Gemini AI extracts <strong>all fields</strong> automatically.</p>
                </div>
                <label className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-[#e0e8e2] text-sm font-medium text-[#52615a] hover:bg-[#f0f5f1] cursor-pointer transition-colors">
                  <ImageIcon className="w-4 h-4" />Upload Image Instead
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => handleOcrCapture(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }} />
                </label>
                {ocrError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{ocrError}</div>}
              </>
            )}

            {ocrLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                {ocrPreview && (
                  <div className="relative w-full rounded-2xl overflow-hidden">
                    <img src={ocrPreview} alt="Captured" className="w-full h-48 object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="flex items-center gap-3 bg-white/90 rounded-xl px-4 py-3">
                        <ScanLine className="w-5 h-5 text-[#5E7464] animate-pulse" />
                        <span className="text-sm font-semibold text-[#1a2820]">Gemini AI reading all fields…</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {ocrResult && ocrPreview && !ocrLoading && (
              <div className="space-y-4">
                <div className="relative w-full rounded-2xl overflow-hidden border border-[#e0e8e2]">
                  <img src={ocrPreview} alt="Scanned" className="w-full h-36 object-cover" />
                  <span className="absolute top-3 right-3 text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-500 text-white uppercase tracking-wider">✓ Scanned</span>
                  <span className={`absolute top-3 left-3 text-[10px] font-black px-2.5 py-1 rounded-full ${ ocrResult.confidence === "high" ? "bg-emerald-100 text-emerald-700" : ocrResult.confidence === "medium" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700" }`}>{ocrResult.confidence} confidence</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#f0f8f2] border border-[#b7eb8f]/40 space-y-3">
                  <p className="text-[10px] font-black text-[#52615a] uppercase tracking-widest">Gemini Extracted — All Fields</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      { l: "Brand Name", v: ocrResult.name },
                      { l: "System", v: ocrResult.system },
                      { l: "Dosage", v: ocrResult.dosage || "—" },
                      { l: "Frequency", v: ocrResult.frequency || "—" },
                      { l: "Timing", v: ocrResult.timing || "—" },
                      { l: "With Food", v: ocrResult.withFood ? "Yes" : "No" },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <p className="text-[10px] font-bold text-[#9ab0a0] uppercase tracking-wider mb-0.5">{l}</p>
                        <p className="font-semibold text-[#1a2820]">{v}</p>
                      </div>
                    ))}
                  </div>
                  {ocrResult.ingredients.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-[#9ab0a0] uppercase tracking-wider mb-1.5">Ingredients</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ocrResult.ingredients.map((ing) => (
                          <span key={ing} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white border border-[#e0e8e2] text-[#52615a]">{ing}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={applyOcrResult}
                    className="flex-1 py-3 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                    <CheckCircle className="w-4 h-4" /> Auto-fill All Fields
                  </button>
                  <button onClick={() => { setOcrPreview(null); setOcrResult(null); setOcrError(""); }}
                    className="px-4 py-3 rounded-xl border border-[#e0e8e2] text-sm font-medium text-[#52615a] hover:bg-[#f0f5f1] transition-colors">
                    Rescan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Voice Tab ═══════════════════════════════════════════════════════ */}
        {tab === "voice" && (
          <div className="space-y-5">
            {/* Language picker */}
            <div>
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-2">Language</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_LANGUAGES.map((l) => (
                  <button key={l.code} onClick={() => setVoiceLang(l.code)}
                    className={`px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${ voiceLang === l.code ? "border-[#5E7464] bg-[#f0f8f2] text-[#42594A] " : "border-[#e0e8e2] text-[#7a9080] hover:border-[#5E7464]/40" }`}>{l.label}</button>
                ))}
              </div>
            </div>

            {/* Mic button */}
            {!voiceReady ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
                Speech recognition is not supported in this browser. Please use Chrome or Edge.
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <button
                  onClick={listening ? stopListening : startListening}
                  disabled={voiceParsing}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl ${ listening ? "bg-red-500 hover:bg-red-600 animate-pulse" : "hover:scale-105" }`}
                  style={!listening ? { background: "linear-gradient(135deg,#5E7464,#42594A)" } : {}}
                >
                  {listening ? <MicOff className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-white" />}
                </button>

                <p className="text-sm font-semibold text-[#1a2820]">
                  {listening ? "Listening… tap to stop" : "Tap to speak"}
                </p>

                {/* Live transcript */}
                {(transcript || interimTranscript || listening) && (
                  <div className="w-full p-4 rounded-2xl bg-[#f8faf8] border border-[#e0e8e2] min-h-[80px]">
                    <p className="text-xs font-bold text-[#9ab0a0] uppercase tracking-widest mb-2">Transcript</p>
                    <p className="text-sm text-[#1a2820]">
                      {transcript}
                      {interimTranscript && (
                        <span className="text-[#9ab0a0] italic"> {interimTranscript}</span>
                      )}
                      {listening && !transcript && !interimTranscript && (
                        <span className="text-[#9ab0a0]">Say the medicine name, dose, and timing…</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Hint box */}
                {!transcript && !listening && (
                  <div className="w-full p-3 rounded-xl bg-[#f0f8f2] border border-[#b7eb8f]/30">
                    <p className="text-xs font-bold text-[#5E7464] mb-1.5">Example phrases:</p>
                    <ul className="space-y-1 text-xs text-[#7a9080]">
                      <li>🇬🇧 "Metformin 500mg, twice a day after meals"</li>
                      <li>🇮🇳 "Ashwagandha ek capsule, raat ko sone se pehle"</li>
                      <li>🇮🇳 "Karela juice 30ml, subah khali pet"</li>
                    </ul>
                  </div>
                )}

                {/* Parse button */}
                {transcript && !listening && (
                  <div className="flex gap-3 w-full">
                    <button onClick={parseTranscript} disabled={voiceParsing}
                      className="flex-1 py-3 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
                      style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
                      {voiceParsing
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Gemini parsing…</>
                        : <><Sparkles className="w-4 h-4" /> Extract & Fill All Fields</>}
                    </button>
                    <button onClick={() => { setTranscript(""); setInterimTranscript(""); }}
                      className="px-4 py-3 rounded-xl border border-[#e0e8e2] text-sm font-medium text-[#52615a] hover:bg-[#f0f5f1] transition-colors">
                      Clear
                    </button>
                  </div>
                )}

                {voiceError && (
                  <div className="w-full p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{voiceError}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ History Tab ══════════════════════════════════════════════════════ */}
        {tab === "past" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-[#52615a] uppercase tracking-widest">Your Current Regimen</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f0f8f2] text-[#5E7464]">{regimen.length} medicines</span>
            </div>
            {regimen.length === 0 && (
              <p className="text-center text-sm text-[#9ab0a0] py-8">No medicines added yet. Add your first one!</p>
            )}
            {regimen.map((med) => (
              <div key={med.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f4f8f5] border border-[#e0e8e2] hover:border-[#5E7464]/30 transition-all group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: systemColor[med.system] || "#9ab0a0" }}>
                  {med.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1a2820] truncate">{med.name}</p>
                  <p className="text-[10px] text-[#9ab0a0]">{med.dosage || "?"} · {med.frequency || "?"} · {med.timing || "?"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { applyFields({ name: med.name, system: med.system, dosage: med.dosage, frequency: med.frequency, timing: med.timing, withFood: med.withFood }); setTab("search"); }}
                    className="text-xs text-[#5E7464] font-semibold hover:underline">Re-check</button>
                  <button onClick={() => handleRemoveFromRegimen(med.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-[#9ab0a0] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Shared Form Fields (always visible) ── */}
        <div>
          <p className="text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-3">
            Medicine Details
            {(form.name || form.dosage) && (
              <span className="ml-2 text-[#5E7464] normal-case font-normal">· auto-filled from {tab === "ocr" ? "OCR" : tab === "voice" ? "voice" : "search"}</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Medicine Name</label>
              <input type="text" placeholder="Medicine name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} readOnly={tab === "search"}
                className="w-full px-4 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:outline-none focus:border-[#5E7464]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">System</label>
              <select value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:outline-none focus:border-[#5E7464]">
                <option value="">Select…</option>
                {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Dosage</label>
              <input type="text" placeholder="e.g. 500mg" value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:outline-none focus:border-[#5E7464]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:outline-none focus:border-[#5E7464]">
                <option value="">Select…</option>
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Timing</label>
              <select value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:outline-none focus:border-[#5E7464]">
                <option value="">Select…</option>
                {TIMINGS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#52615a] uppercase tracking-widest mb-1.5">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] text-sm focus:outline-none focus:border-[#5E7464]" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setForm({ ...form, withFood: !form.withFood })}>
                <div className={`w-11 h-6 rounded-full transition-colors relative ${form.withFood ? "bg-[#5E7464]" : "bg-[#e0e8e2] "}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.withFood ? "translate-x-6" : "translate-x-1"}`} />
                </div>
                <span className="text-sm font-medium text-[#1a2820]">With food</span>
              </label>
            </div>
          </div>
        </div>

        {/* Regimen context */}
        <div className="p-3 rounded-xl bg-[#f0f8f2] border border-[#b7eb8f]/40">
          <p className="text-[10px] font-bold text-[#52615a] uppercase tracking-widest mb-1.5">Checking Against Your Current Regimen ({regimenNames.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {regimenNames.map((m) => (
              <span key={m} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#e0e8e2] text-[#52615a]">{m}</span>
            ))}
          </div>
        </div>

        {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        <button onClick={runCheck} disabled={checking}
          className="w-full flex items-center justify-center gap-3 text-white text-sm font-semibold py-4 rounded-xl transition-all hover:shadow-[0_8px_30px_rgba(94,116,100,0.35)] disabled:opacity-70"
          style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
          {checking ? <><Loader2 className="w-5 h-5 animate-spin" /> Gemini AI analysing…</> : <><Sparkles className="w-5 h-5" /> Run AI Safety Check</>}
        </button>
      </div>

      {/* ─── Verdict Card ─────────────────────────────────────────────────── */}
      {result && (() => {
        const v = verdictConfig[result.verdict];
        return (
          <div className="rounded-2xl border p-6" style={{ background: v.bg, borderColor: v.border }}>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: v.iconBg }}>
                <v.icon className="w-5 h-5" style={{ color: v.text }} />
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: v.text }}>{v.label}</span>
                <p className="font-manrope font-bold text-lg leading-tight mt-0.5" style={{ color: v.text }}>
                  {result.medicines.join(" + ")}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div className="p-4 rounded-xl bg-white/60">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: v.text }}>Why This Matters</p>
                <p className="text-sm leading-relaxed" style={{ color: v.text }}>{result.reason}</p>
              </div>
              <div className="p-4 rounded-xl bg-white/60">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: v.text }}>What To Do</p>
                <p className="text-sm leading-relaxed" style={{ color: v.text }}>{result.suggestion}</p>
              </div>
            </div>

            <p className="text-[10px] text-center mb-4 opacity-60" style={{ color: v.text }}>
              ⚕ Powered by Gemini AI · Not a substitute for medical advice
            </p>

            <div className="flex gap-3">
              <button onClick={handleAddToRegimen}
                className="flex-1 py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2 transition-all"
                style={{ background: v.text }}>
                {addedSuccess ? <><CheckCircle className="w-4 h-4" /> Added!</> : <><Plus className="w-4 h-4" /> {result.verdict === "green" ? "Add to Regimen" : "Add Despite Warning"}</>}
              </button>
              <button
                onClick={handleFindAlternatives}
                disabled={findingAlternatives}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl border bg-white/70 disabled:opacity-70"
                style={{ borderColor: v.border, color: v.text }}
              >
                {findingAlternatives ? "Finding alternatives..." : "Find Alternatives"}
              </button>
            </div>

            {(alternativesSummary || alternativesWarning || alternatives.length > 0) && (
              <div className="mt-4 p-4 rounded-xl bg-white/70 border" style={{ borderColor: v.border }}>
                {alternativesSummary && <p className="text-sm font-semibold mb-2" style={{ color: v.text }}>{alternativesSummary}</p>}
                {alternatives.length > 0 && (
                  <div className="space-y-2">
                    {alternatives.map((alt, idx) => (
                      <div key={`${alt.name}-${idx}`} className="p-3 rounded-lg bg-white border border-[#e8e8e8]">
                        <p className="text-sm font-bold text-[#1a2820]">{alt.name}</p>
                        <p className="text-xs text-[#52615a]">{alt.system} · {alt.confidence} confidence · {alt.source}</p>
                        <p className="text-xs mt-1 text-[#42594A]">{alt.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
                {alternativesWarning && <p className="text-xs mt-2 text-[#875400]">{alternativesWarning}</p>}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Inline CameraScanner Overlay ─────────────────────────────────── */}
      {showCamera && (
        <CameraScanner
          onCapture={handleOcrCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
