"use client";
import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Mic, Loader2, MicOff } from "lucide-react";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { getLanguage, type LangCode } from "@/lib/i18n";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const STARTERS = [
  "What is CYP450?",
  "Is ashwagandha safe with metformin?",
  "What timing should I follow?",
  "What is a safer alternative?",
];

export default function FloatingAIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    await trackEvent(AnalyticsEvents.ASSISTANT_INVOKED, { prompt_length: userMsg.length });

    try {
      const language = getLanguage() as LangCode;
      const history = messages.slice(-8);
      const resp = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, language, history }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.reply || "I'm having trouble answering that. Please try again." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Sorry, I couldn't reach the SafeMix AI. Please check your connection." }]);
    } finally {
      setLoading(false);
    }
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    recognitionRef.current = r;
    r.lang = "hi-IN";
    r.interimResults = false;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      send(t);
    };
    r.start();
    trackEvent(AnalyticsEvents.ASSISTANT_VOICE, {});
  };

  const stopVoice = () => { recognitionRef.current?.stop(); setListening(false); };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI Assistant"
        className={`fixed bottom-24 right-5 md:bottom-8 md:right-8 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${open ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}
      >
        <Sparkles className="w-6 h-6 text-white" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full text-[8px] font-black text-white flex items-center justify-center">AI</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-50 w-full md:w-96 h-[480px] md:h-[520px] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl border border-[#e0e8e2] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f4f1]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#5E7464] to-[#42594A] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#1a2820]">SafeMix AI</p>
                <p className="text-[10px] text-[#7a9080]">Medication safety assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full bg-[#f0f4f1] flex items-center justify-center hover:bg-[#e0e8e2] transition-all">
              <X className="w-3.5 h-3.5 text-[#52615a]" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-center text-[#9ab0a0]">Ask me anything about your medicines</p>
                <div className="grid grid-cols-2 gap-2">
                  {STARTERS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left text-xs p-2.5 rounded-xl border border-[#e8f0ea] bg-[#F8F8F4] text-[#52615a] hover:border-[#5E7464] transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${ m.role === "user" ? "bg-[#5E7464] text-white rounded-br-md" : "bg-[#F4F7F5] text-[#1a2820] rounded-bl-md border border-[#e8f0ea] " }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#F4F7F5] border border-[#e8f0ea] px-3.5 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-[#5E7464]" />
                  <span className="text-xs text-[#7a9080]">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#f0f4f1] flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask about your medicines…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send(input)}
              className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-[#e0e8e2] bg-[#F8F8F4] text-[#1a2820] outline-none focus:border-[#5E7464] transition-all"
            />
            <button
              onClick={listening ? stopVoice : startVoice}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${listening ? "bg-red-100 text-red-500" : "bg-[#F4F7F5] text-[#7a9080] hover:text-[#5E7464]"}`}>
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
              style={{ background: "linear-gradient(135deg,#5E7464,#42594A)" }}>
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>

          <p className="text-center text-[9px] text-[#c0cfc5] pb-2">For awareness, not diagnosis · SafeMix AI</p>
        </div>
      )}
    </>
  );
}
