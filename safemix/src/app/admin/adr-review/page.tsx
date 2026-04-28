"use client";
import { useState, useEffect } from "react";
import { getAllAdrReports, type AdrReport } from "@/lib/firebase/firestore";
import { AlertTriangle, CheckCircle, Clock, User, Pill, Calendar, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";

// Map PvPI seriousness → display severity bucket.
const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
  non_serious:        { color: "#F59E0B", bg: "#FFFBE6", label: "Non-serious" },
  hospitalisation:    { color: "#EF6C00", bg: "#FFF3E0", label: "Hospitalised" },
  life_threatening:   { color: "#C41C00", bg: "#FFF1F0", label: "Life-threatening" },
  disability:         { color: "#C41C00", bg: "#FFF1F0", label: "Disability" },
  congenital_anomaly: { color: "#C41C00", bg: "#FFF1F0", label: "Congenital anomaly" },
  death:              { color: "#C41C00", bg: "#FFF1F0", label: "Death" },
  other_serious:      { color: "#EF6C00", bg: "#FFF3E0", label: "Other serious" },
};
const SERIOUS_BUCKET = new Set(["hospitalisation", "life_threatening", "disability", "congenital_anomaly", "death", "other_serious"]);

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending_review: { icon: Clock,         color: "#F59E0B", label: "Pending Review" },
  reviewed:       { icon: CheckCircle,   color: "#10B981", label: "Reviewed" },
  forwarded:      { icon: AlertTriangle, color: "#3B82F6", label: "Forwarded" },
};

export default function AdrReviewPage() {
  const [reports, setReports] = useState<(AdrReport & { docId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await getAllAdrReports();
      setReports(data);
    } catch (err: any) {
      setError("Failed to load reports. Make sure Firestore rules allow admin access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, []);

  return (
    <div className="min-h-screen bg-[#F4F7F5] p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-manrope font-bold text-2xl text-[#1a2820]">
              ADR Report Review
            </h1>
            <p className="text-sm text-[#7a9080] mt-0.5">
              Adverse Drug Reaction reports submitted by SafeMix users
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadReports}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#e0e8e2] text-sm font-medium text-[#52615a] hover:bg-white transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <Link href="/admin" className="px-4 py-2 rounded-xl bg-[#42594A] text-white text-sm font-medium">
              ← Admin
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Reports", value: reports.length, color: "#5E7464" },
            { label: "Pending Review", value: reports.filter(r => r.status === "pending_review").length, color: "#F59E0B" },
            { label: "Serious Events", value: reports.filter(r => SERIOUS_BUCKET.has(r.seriousness)).length, color: "#C41C00" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-[#e0e8e2] p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs text-[#7a9080] mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Reports */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#5E7464] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20 text-[#7a9080]">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">No ADR reports submitted yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const sev = severityConfig[report.seriousness] || { color: "#52615a", bg: "#F8F8F4", label: report.seriousness };
              const StatusIcon = statusConfig[report.status]?.icon || Clock;
              const statusColor = statusConfig[report.status]?.color || "#52615a";
              const statusLabel = statusConfig[report.status]?.label || report.status;

              return (
                <div key={report.docId} className="bg-white rounded-2xl border border-[#e0e8e2] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black px-2 py-1 rounded-full" style={{ background: sev.bg, color: sev.color }}>
                        {sev.label.toUpperCase()}
                      </span>
                      <h3 className="font-bold text-[#1a2820]">{report.suspectedMedicine}</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f0f5f1] text-[#42594A] uppercase tracking-widest">{report.medicineSystem}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: statusColor }}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusLabel}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-[#7a9080]">
                    <div className="flex items-center gap-1.5 truncate">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="truncate" title={report.reactionDescription}>{report.reactionDescription}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{report.reactionStartDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>Doctor {report.doctorNotified ? "notified" : "not notified"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(report.reportedAt).toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>

                  {report.notes && (
                    <p className="text-sm text-[#52615a] bg-[#F8F8F4] rounded-xl p-3">
                      {report.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#f0f4f1]">
                    <span className="text-[10px] font-mono text-[#9ab0a0]">ID: {report.docId}</span>
                    <span className="text-[10px] text-[#9ab0a0]">UID: {report.uid?.slice(0, 8)}…</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
