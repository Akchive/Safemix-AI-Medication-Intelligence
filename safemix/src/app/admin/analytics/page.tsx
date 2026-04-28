"use client";
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
import { Loader2, MapPin, TrendingUp, Activity, Download } from "lucide-react";

type SeverityFilter = "all" | "red" | "yellow" | "green";

function filterByWindow(samples: VerdictSample[], days: number): VerdictSample[] {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  return samples.filter((s) => s.checkedAt >= start);
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h]!)).join(","));
  return lines.join("\n");
}

export default function AnalyticsAdminPage() {
  const [samples, setSamples] = useState<VerdictSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<14 | 30 | 90>(30);
  const [severity, setSeverity] = useState<SeverityFilter>("all");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchRecentVerdicts(5000);
        setSamples(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const timeScoped = useMemo(() => filterByWindow(samples, days), [samples, days]);
  const scoped = useMemo(
    () => severity === "all" ? timeScoped : timeScoped.filter((s) => s.verdict === severity),
    [timeScoped, severity]
  );

  const states = useMemo(() => aggregateByState(scoped), [scoped]);
  const retention = useMemo(() => computeRetention(scoped, 14), [scoped]);
  const pairs = useMemo(() => topPairs(scoped, 10), [scoped]);

  const csvRows = useMemo(
    () => states.map((s) => ({ state: s.state, users: s.users, red_alerts: s.redAlerts, yellow_alerts: s.yellowAlerts, total_events: s.total })),
    [states]
  );

  const exportCsv = () => {
    const csv = toCsv(csvRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safemix-geo-${days}d-${severity}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#5E7464]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-manrope font-bold text-2xl text-[#1a2820]">Analytics</h1>
          <p className="text-sm text-[#7a9080] mt-0.5">
            k-anonymity guard active (k={K_ANON}). Time window and severity filters apply to all panels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as 14 | 30 | 90)} className="px-3 py-2 rounded-xl border border-[#e0e8e2] bg-white text-sm">
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as SeverityFilter)} className="px-3 py-2 rounded-xl border border-[#e0e8e2] bg-white text-sm">
            <option value="all">All severities</option>
            <option value="red">Red only</option>
            <option value="yellow">Yellow only</option>
            <option value="green">Green only</option>
          </select>
          <button onClick={exportCsv} className="px-3 py-2 rounded-xl bg-[#42594A] text-white text-sm font-semibold flex items-center gap-1.5">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {scoped.length === 0 ? (
        <div className="bg-white border border-[#e0e8e2] rounded-2xl p-10 text-center text-[#9ab0a0] text-sm">
          No verdict events for the selected filters.
        </div>
      ) : (
        <>
          <div className="bg-white border border-[#e0e8e2] rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-[#1a2820] text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#5E7464]" /> Panel 4 · Geography of interaction events
            </h2>
            <p className="text-xs text-[#7a9080]">State-level distribution. States below k-anonymity are folded into “Other”.</p>
            <ResponsiveContainer width="100%" height={Math.max(260, states.length * 34)}>
              <BarChart data={states} layout="vertical" margin={{ left: 10, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f1" />
                <XAxis type="number" stroke="#7a9080" />
                <YAxis dataKey="state" type="category" stroke="#7a9080" width={170} />
                <Tooltip />
                <Legend />
                <Bar dataKey="redAlerts" stackId="a" name="Red" fill="#C41C00" />
                <Bar dataKey="yellowAlerts" stackId="a" name="Yellow" fill="#F59E0B" />
                <Bar dataKey="total" name="Total events" fill="#5E7464" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-[#e0e8e2] rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-[#1a2820] text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#5E7464]" /> Panel 5 · DAU / WAU / MAU
            </h2>
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

          <div className="bg-white border border-[#e0e8e2] rounded-3xl p-5 space-y-3">
            <h2 className="font-bold text-[#1a2820] text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#5E7464]" /> State drilldown (table)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-[#9ab0a0]">
                  <tr>
                    <th className="text-left px-2 py-2">State</th>
                    <th className="text-right px-2 py-2">Users</th>
                    <th className="text-right px-2 py-2">Red</th>
                    <th className="text-right px-2 py-2">Yellow</th>
                    <th className="text-right px-2 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {states.map((s) => (
                    <tr key={s.state} className="border-t border-[#f0f4f1]">
                      <td className="px-2 py-2 text-[#52615a]">{s.state}</td>
                      <td className="px-2 py-2 text-right font-mono text-[#42594A]">{s.users}</td>
                      <td className="px-2 py-2 text-right font-mono text-[#C41C00]">{s.redAlerts}</td>
                      <td className="px-2 py-2 text-right font-mono text-[#B45309]">{s.yellowAlerts}</td>
                      <td className="px-2 py-2 text-right font-mono text-[#42594A]">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
