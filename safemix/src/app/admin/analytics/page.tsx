"use client";
/**
 * Admin module — Analytics dashboard panels 4 + 5 (PRD §8.4).
 *
 * Panel 4 (Geography heatmap): state-level interaction-event density,
 *   bucketed for k-anonymity ≥ 5.
 * Panel 5 (Retention & Engagement): rolling DAU/WAU/MAU stickiness chart,
 *   plus a top-pairs frequency table that doubles as the §8.4 panel 3
 *   "most common interactions" view.
 */
import { useEffect, useMemo, useState } from "react";
import {
  fetchRecentVerdicts,
  aggregateByState,
  computeRetention,
  topPairs,
  K_ANON,
  type VerdictSample,
} from "@/lib/analyticsAggregates";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, Legend, CartesianGrid,
} from "recharts";
import { Loader2, MapPin, TrendingUp, Activity } from "lucide-react";

export default function AnalyticsAdminPage() {
  const [samples, setSamples] = useState<VerdictSample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchRecentVerdicts(1000);
        setSamples(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const states = useMemo(() => aggregateByState(samples), [samples]);
  const retention = useMemo(() => computeRetention(samples, 14), [samples]);
  const pairs = useMemo(() => topPairs(samples, 10), [samples]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#5E7464]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-manrope font-bold text-2xl text-[#1a2820]">Analytics</h1>
        <p className="text-sm text-[#7a9080] mt-0.5">
          Sample over the latest 1k verdict events. States with fewer than {K_ANON} unique users are bucketed for k-anonymity.
        </p>
      </div>

      {samples.length === 0 ? (
        <div className="bg-white border border-[#e0e8e2] rounded-2xl p-10 text-center text-[#9ab0a0] text-sm">
          No verdict events yet. Run a few interaction checks as a patient and they will start appearing here.
        </div>
      ) : (
        <>
          {/* Panel 4 — Geography */}
          <div className="bg-white border border-[#e0e8e2] rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-[#1a2820] text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#5E7464]" /> Panel 4 · Geography of interaction events
            </h2>
            <p className="text-xs text-[#7a9080]">
              State-level density of interaction events. The "Other" bucket aggregates any state with fewer than {K_ANON} unique users so individuals cannot be re-identified.
            </p>
            <ResponsiveContainer width="100%" height={Math.max(220, states.length * 30)}>
              <BarChart data={states} layout="vertical" margin={{ left: 10, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f1" />
                <XAxis type="number" stroke="#7a9080" />
                <YAxis dataKey="state" type="category" stroke="#7a9080" width={140} />
                <Tooltip />
                <Legend />
                <Bar dataKey="redAlerts" stackId="a" name="Red" fill="#C41C00" />
                <Bar dataKey="yellowAlerts" stackId="a" name="Yellow" fill="#F59E0B" />
                <Bar dataKey="total" name="Total events" fill="#5E7464" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Panel 5 — Retention */}
          <div className="bg-white border border-[#e0e8e2] rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-[#1a2820] text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#5E7464]" /> Panel 5 · DAU / WAU / MAU
            </h2>
            <p className="text-xs text-[#7a9080]">
              Rolling 14-day stickiness. Anyone running an interaction check that day counts as active.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={retention} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f1" />
                <XAxis dataKey="date" stroke="#7a9080" />
                <YAxis stroke="#7a9080" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="dau" name="DAU" stroke="#42594A" strokeWidth={2} />
                <Line type="monotone" dataKey="wau" name="WAU" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="mau" name="MAU" stroke="#8B5CF6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top pairs table */}
          <div className="bg-white border border-[#e0e8e2] rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-[#1a2820] text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#5E7464]" /> Most common interactions
            </h2>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-[#9ab0a0]">
                <tr><th className="text-left px-2 py-2">Pair</th><th className="text-right px-2 py-2">Events</th></tr>
              </thead>
              <tbody>
                {pairs.length === 0 && (
                  <tr><td colSpan={2} className="px-2 py-4 text-[#9ab0a0] text-center">No pairs yet.</td></tr>
                )}
                {pairs.map((p) => (
                  <tr key={p.pair} className="border-t border-[#f0f4f1]">
                    <td className="px-2 py-2 text-[#52615a]">{p.pair}</td>
                    <td className="px-2 py-2 text-right font-mono text-[#42594A]">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
