import { useState } from "react";
import { useUser } from "@clerk/react";
import { useGetReport } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getReportsFromLocalStorage } from "@/lib/local-storage";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Clock, CheckCircle, XCircle, Loader2, FileText, ArrowRight, RefreshCw, ShieldAlert, TrendingDown, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const statusConfig: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
  pending: { label: "Pending", icon: <Clock className="h-3 w-3" />, class: "bg-amber-100 text-amber-800 border-amber-200" },
  processing: { label: "Processing", icon: <Loader2 className="h-3 w-3 animate-spin" />, class: "bg-blue-100 text-blue-800 border-blue-200" },
  complete: { label: "Complete", icon: <CheckCircle className="h-3 w-3" />, class: "bg-green-100 text-green-800 border-green-200" },
  failed: { label: "Failed", icon: <XCircle className="h-3 w-3" />, class: "bg-red-100 text-red-800 border-red-200" },
  awaiting_payment: { label: "Awaiting Payment", icon: <Clock className="h-3 w-3" />, class: "bg-purple-100 text-purple-800 border-purple-200" },
};

const riskColor: Record<string, { bar: string; badge: string; text: string }> = {
  low: { bar: "#22c55e", badge: "bg-green-100 text-green-800 border-green-200", text: "text-green-700" },
  medium: { bar: "#f59e0b", badge: "bg-amber-100 text-amber-800 border-amber-200", text: "text-amber-700" },
  high: { bar: "#f97316", badge: "bg-orange-100 text-orange-800 border-orange-200", text: "text-orange-700" },
  critical: { bar: "#ef4444", badge: "bg-red-100 text-red-800 border-red-200", text: "text-red-700" },
};

type ApiReport = {
  id: number;
  inputUrl: string | null;
  inputAddress: string | null;
  email: string;
  status: string;
  createdAt: string;
  score: number | null;
  riskLevel: string | null;
};

// ── Mini score arc (SVG half-circle gauge) ────────────────────────────────────
function MiniGauge({ score, riskLevel }: { score: number; riskLevel: string }) {
  const r = 28;
  const circ = Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = riskColor[riskLevel]?.bar ?? "#94a3b8";
  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="42" viewBox="0 0 72 42">
        <path d={`M 6 38 A ${r} ${r} 0 0 1 66 38`} fill="none" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" />
        <path
          d={`M 6 38 A ${r} ${r} 0 0 1 66 38`}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text x="36" y="36" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1a2a22">
          {Math.round(score)}
        </text>
      </svg>
    </div>
  );
}

// ── Report card (server data — has score) ─────────────────────────────────────
function ReportCard({ report }: { report: ApiReport }) {
  const cfg = statusConfig[report.status] ?? statusConfig.pending;
  const input = report.inputUrl || report.inputAddress || `Report #${report.id}`;
  const rc = report.riskLevel ? riskColor[report.riskLevel] : null;
  const hasScore = report.status === "complete" && report.score != null && report.riskLevel;

  return (
    <Card className="hover:border-primary/30 hover:shadow-sm transition-all group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-1">Report #{report.id}</p>
            <p className="text-sm font-semibold text-slate-900 truncate leading-snug">{input}</p>
            <p className="text-xs text-slate-400 mt-1">
              {new Date(report.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <Badge className={`flex items-center gap-1 text-xs border flex-shrink-0 ${cfg.class}`}>
            {cfg.icon} {cfg.label}
          </Badge>
        </div>

        {hasScore && report.score != null && report.riskLevel ? (
          <div className="flex items-center gap-4 border-t pt-3">
            <MiniGauge score={report.score} riskLevel={report.riskLevel} />
            <div className="flex-1">
              <Badge className={`text-xs border capitalize mb-1.5 ${rc?.badge ?? ""}`}>
                {report.riskLevel} risk
              </Badge>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${report.score}%`, backgroundColor: rc?.bar ?? "#94a3b8" }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{Math.round(report.score)}/100 fraud risk score</p>
            </div>
          </div>
        ) : report.status === "complete" ? (
          <div className="flex items-center gap-2 border-t pt-3 text-xs text-green-600">
            <CheckCircle className="h-3.5 w-3.5" /> Analysis complete — no score data
          </div>
        ) : (report.status === "pending" || report.status === "processing") ? (
          <div className="flex items-center gap-2 border-t pt-3 text-xs text-blue-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysis in progress…
          </div>
        ) : null}

        <Link href={`/reports/${report.id}`}>
          <Button variant="ghost" size="sm" className="w-full mt-3 gap-1.5 text-xs h-8 group-hover:bg-primary/5">
            View Full Report <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Local-only card (fetches its own data) ────────────────────────────────────
function LocalReportCard({ id }: { id: number }) {
  const { data, isLoading } = useGetReport(id, {
    query: {
      refetchInterval: (query) => {
        const status = (query.state.data as { status?: string })?.status;
        return status === "pending" || status === "processing" ? 5000 : false;
      },
    },
  });

  const status = data?.status ?? "pending";
  const cfg = statusConfig[status] ?? statusConfig.pending;
  const input = data?.inputUrl || data?.inputAddress || `Report #${id}`;
  const fraudScore = (data as { fraudScore?: { score: number; riskLevel: string } } | undefined)?.fraudScore;
  const rc = fraudScore?.riskLevel ? riskColor[fraudScore.riskLevel] : null;
  const hasScore = status === "complete" && fraudScore;

  return (
    <Card className="hover:border-primary/30 hover:shadow-sm transition-all group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-1">Report #{id}</p>
            {isLoading ? (
              <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4 mb-2" />
            ) : (
              <p className="text-sm font-semibold text-slate-900 truncate leading-snug">{input}</p>
            )}
            {data?.createdAt && (
              <p className="text-xs text-slate-400 mt-1">
                {new Date(data.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
          <Badge className={`flex items-center gap-1 text-xs border flex-shrink-0 ${cfg.class}`}>
            {cfg.icon} {cfg.label}
          </Badge>
        </div>

        {hasScore && fraudScore ? (
          <div className="flex items-center gap-4 border-t pt-3">
            <MiniGauge score={fraudScore.score} riskLevel={fraudScore.riskLevel} />
            <div className="flex-1">
              <Badge className={`text-xs border capitalize mb-1.5 ${rc?.badge ?? ""}`}>
                {fraudScore.riskLevel} risk
              </Badge>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${fraudScore.score}%`, backgroundColor: rc?.bar ?? "#94a3b8" }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{Math.round(fraudScore.score)}/100 fraud risk score</p>
            </div>
          </div>
        ) : (status === "pending" || status === "processing") ? (
          <div className="flex items-center gap-2 border-t pt-3 text-xs text-blue-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysis in progress…
          </div>
        ) : null}

        <Link href={`/reports/${id}`}>
          <Button variant="ghost" size="sm" className="w-full mt-3 gap-1.5 text-xs h-8 group-hover:bg-primary/5">
            View Full Report <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ reports }: { reports: ApiReport[] }) {
  const completed = reports.filter((r) => r.status === "complete");
  const highRisk = completed.filter((r) => r.riskLevel === "high" || r.riskLevel === "critical");
  const avgScore = completed.length > 0 && completed.some((r) => r.score != null)
    ? Math.round(completed.filter((r) => r.score != null).reduce((s, r) => s + r.score!, 0) / completed.filter((r) => r.score != null).length)
    : null;

  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {[
        { icon: FileText, label: "Total Reports", value: String(reports.length), sub: `${completed.length} complete` },
        { icon: TrendingDown, label: "Avg Fraud Score", value: avgScore != null ? `${avgScore}/100` : "—", sub: "across completed reports" },
        { icon: ShieldAlert, label: "High Risk", value: String(highRisk.length), sub: `${completed.length > 0 ? Math.round((highRisk.length / completed.length) * 100) : 0}% of completed` },
      ].map(({ icon: Icon, label, value, sub }) => (
        <Card key={label}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
                <p className="text-xs text-slate-400">{sub}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyReportsPage() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const userId = user?.id ?? "";

  const [filter, setFilter] = useState<"all" | "complete" | "pending" | "high_risk">("all");

  const { data: serverData, isLoading, refetch } = useQuery<{ reports: ApiReport[] }>({
    queryKey: ["my-reports-server", userId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/reports/mine?userId=${encodeURIComponent(userId)}`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<{ reports: ApiReport[] }>;
    },
    enabled: !!userId,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const serverReports = serverData?.reports ?? [];
  const serverIds = new Set(serverReports.map((r) => r.id));
  const localReports = getReportsFromLocalStorage(email).filter((r) => !serverIds.has(r.id));
  const totalCount = serverReports.length + localReports.length;

  const filteredServer = serverReports.filter((r) => {
    if (filter === "complete") return r.status === "complete";
    if (filter === "pending") return r.status === "pending" || r.status === "processing" || r.status === "awaiting_payment";
    if (filter === "high_risk") return r.riskLevel === "high" || r.riskLevel === "critical";
    return true;
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Reports</h1>
            <p className="text-slate-500 mt-1">
              Fraud analyses submitted by {email || "your account"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {userId && (
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            )}
            <Link href="/check">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New Report
              </Button>
            </Link>
          </div>
        </div>

        {isLoading && serverReports.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading your reports…</span>
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-24 text-slate-400">
            <div className="bg-slate-100 rounded-full p-5 w-20 h-20 mx-auto mb-5 flex items-center justify-center">
              <FileText className="h-10 w-10 opacity-40" />
            </div>
            <p className="text-xl font-semibold text-slate-700 mb-2">No reports yet</p>
            <p className="text-sm mb-6">Check your first property to see fraud risk analysis here.</p>
            <Link href="/check">
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Check a Property
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Stats bar — only for server reports with data */}
            {serverReports.length >= 2 && <StatsBar reports={serverReports} />}

            {/* High-risk alert banner */}
            {serverReports.some((r) => r.riskLevel === "critical") && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">You have a CRITICAL risk report</p>
                  <p className="text-xs text-red-600 mt-0.5">At least one of your checked listings has been flagged as critical fraud risk. Do not pay any deposit.</p>
                </div>
              </div>
            )}

            {/* Filters */}
            {serverReports.length > 3 && (
              <div className="flex gap-2 mb-6 flex-wrap">
                {(["all", "complete", "pending", "high_risk"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      filter === f
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"
                    }`}
                  >
                    {f === "all" ? "All" : f === "complete" ? "Complete" : f === "pending" ? "In Progress" : "High Risk"}
                  </button>
                ))}
              </div>
            )}

            {/* Cards grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredServer.map((r) => (
                <ReportCard key={r.id} report={r} />
              ))}
              {filter === "all" && localReports.map((r) => (
                <LocalReportCard key={r.id} id={r.id} />
              ))}
            </div>

            {filteredServer.length === 0 && filter !== "all" && (
              <div className="text-center py-12 text-slate-400">
                <p>No reports match this filter.</p>
                <button onClick={() => setFilter("all")} className="text-primary text-sm mt-2 hover:underline">
                  Show all reports
                </button>
              </div>
            )}

            {localReports.length > 0 && serverReports.length === 0 && (
              <p className="mt-6 text-xs text-slate-400 text-center">
                Reports submitted while signed in are automatically saved to your account and include detailed score data.
              </p>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
