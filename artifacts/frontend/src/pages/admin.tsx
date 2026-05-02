import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, FileText, Database, TrendingUp, AlertTriangle,
  CheckCircle, Clock, XCircle, Loader2, RefreshCw, Play, ExternalLink,
  Bell, MapPin, Home, Building2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",").map((e: string) => e.trim().toLowerCase()).filter(Boolean);

type Stats = {
  reports: {
    total: number; pending: number; processing: number;
    complete: number; failed: number; awaitingPayment: number; paid: number;
  };
  fraudScores: { total: number; avgScore: number; critical: number; high: number; medium: number; low: number };
  scammerRegistry: { total: number; confirmed: number };
  listings: { total: number };
  clusters: { total: number };
};

type ReportRow = {
  id: number; email: string; status: string; inputUrl: string | null;
  inputAddress: string | null; isPaid: number; createdAt: string;
  score: number | null; riskLevel: string | null;
};

type ScammerRow = {
  id: number; phoneNumber: string; normalisedPhone: string;
  reportCount: number; linkedListingCount: number; isConfirmed: boolean;
  notes: string | null; createdAt: string;
};

type AlertRow = {
  id: number; userId: string; email: string | null;
  neighbourhood: string | null; listingType: string | null;
  maxPriceKsh: number | null; minBedrooms: number | null;
  maxBedrooms: number | null; isActive: boolean; createdAt: string;
};

type AlertsData = {
  alerts: AlertRow[];
  total: number;
  demand: {
    byNeighbourhood: Array<{ neighbourhood: string | null; count: number }>;
    byListingType: Array<{ listingType: string | null; count: number }>;
  };
};

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_COLORS: Record<string, string> = {
  complete: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
  awaiting_payment: "bg-purple-100 text-purple-700",
};

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export default function AdminPage() {
  const { user, isLoaded } = useUser();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "reports" | "scammers" | "alerts">("overview");

  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? "";
  const isAdmin = ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(email);

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["admin-stats"],
    queryFn: () => fetchApi<Stats>("/admin/stats"),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const { data: reportsData, isLoading: reportsLoading } = useQuery<{ reports: ReportRow[] }>({
    queryKey: ["admin-reports"],
    queryFn: () => fetchApi<{ reports: ReportRow[] }>("/admin/reports?limit=50"),
    enabled: isAdmin && tab === "reports",
    refetchInterval: 15_000,
  });

  const { data: scammersData, isLoading: scammersLoading } = useQuery<{ scammers: ScammerRow[] }>({
    queryKey: ["admin-scammers"],
    queryFn: () => fetchApi<{ scammers: ScammerRow[] }>("/admin/scammers"),
    enabled: isAdmin && tab === "scammers",
    refetchInterval: 30_000,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery<AlertsData>({
    queryKey: ["admin-alerts"],
    queryFn: () => fetchApi<AlertsData>("/admin/alerts"),
    enabled: isAdmin && tab === "alerts",
    refetchInterval: 30_000,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ id, confirmed }: { id: number; confirmed: boolean }) =>
      fetch(`${BASE}/api/admin/scammers/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-scammers"] }),
  });

  const [simulatingId, setSimulatingId] = useState<number | null>(null);

  async function handleSimulate(reportId: number) {
    setSimulatingId(reportId);
    try {
      const r = await fetch(`${BASE}/api/admin/reports/${reportId}/simulate`, { method: "POST" });
      const j = await r.json() as { ok?: boolean; error?: string; status?: string };
      if (j.ok) {
        await qc.invalidateQueries({ queryKey: ["admin-reports"] });
        await qc.invalidateQueries({ queryKey: ["admin-stats"] });
      } else {
        console.error("simulate error", j.error);
      }
    } catch (e) {
      console.error("simulate fetch error", e);
    } finally {
      setSimulatingId(null);
    }
  }

  if (!isLoaded) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <ShieldCheck className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Admin Access Required</h1>
          <p className="text-slate-500">Please sign in to continue.</p>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
          <p className="text-slate-500">Your account does not have admin privileges.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">NyumbaCheck platform operations</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries()}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        {statsLoading ? (
          <div className="flex items-center gap-2 text-slate-400 mb-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading stats…</div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={<FileText className="h-5 w-5 text-primary" />} label="Total Reports" value={stats.reports.total} sub={`${stats.reports.complete} complete`} />
            <StatCard icon={<TrendingUp className="h-5 w-5 text-amber-500" />} label="Avg Fraud Score" value={stats.fraudScores.avgScore ?? "—"} sub={`${stats.fraudScores.critical} critical`} />
            <StatCard icon={<AlertTriangle className="h-5 w-5 text-red-500" />} label="Scammer Registry" value={stats.scammerRegistry.total} sub={`${stats.scammerRegistry.confirmed} confirmed`} />
            <StatCard icon={<Database className="h-5 w-5 text-blue-500" />} label="Listings Indexed" value={stats.listings.total} sub={`${stats.clusters.total} clusters`} />
          </div>
        ) : null}

        {/* Report status mini-row */}
        {stats && (
          <div className="flex flex-wrap gap-2 mb-8">
            <StatusPill label="Complete" count={stats.reports.complete} color="bg-green-100 text-green-700" />
            <StatusPill label="Processing" count={stats.reports.processing} color="bg-blue-100 text-blue-700" />
            <StatusPill label="Pending" count={stats.reports.pending} color="bg-slate-100 text-slate-600" />
            <StatusPill label="Awaiting Payment" count={stats.reports.awaitingPayment} color="bg-purple-100 text-purple-700" />
            <StatusPill label="Failed" count={stats.reports.failed} color="bg-red-100 text-red-700" />
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {([
            { key: "overview", label: "Overview" },
            { key: "reports", label: "Reports" },
            { key: "scammers", label: "Scammers" },
            { key: "alerts", label: "Price Alerts" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && stats && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Risk Distribution</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(["critical", "high", "medium", "low"] as const).map((r) => {
                  const count = stats.fraudScores[r];
                  const total = stats.fraudScores.total || 1;
                  return (
                    <div key={r}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize font-medium text-slate-700">{r}</span>
                        <span className="text-slate-500">{count} ({Math.round((count / total) * 100)}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r === "critical" ? "bg-red-500" : r === "high" ? "bg-orange-400" : r === "medium" ? "bg-yellow-400" : "bg-green-400"}`}
                          style={{ width: `${Math.round((count / total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Payment Overview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Paid Reports</span>
                  <span className="font-semibold text-slate-800">{stats.reports.paid}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Free / Demo Mode</span>
                  <span className="font-semibold text-slate-800">{stats.reports.total - stats.reports.paid}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Scammers Confirmed</span>
                  <span className="font-semibold text-slate-800">{stats.scammerRegistry.confirmed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Dedup Clusters</span>
                  <span className="font-semibold text-slate-800">{stats.clusters.total}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Reports tab */}
        {tab === "reports" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Reports</CardTitle></CardHeader>
            <CardContent className="p-0">
              {reportsLoading ? (
                <div className="flex items-center gap-2 p-6 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">#</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Email</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Score</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Input</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Created</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportsData?.reports ?? []).map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.id}</td>
                          <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">{r.email}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {r.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {r.score != null ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${RISK_COLORS[r.riskLevel ?? "low"] ?? ""}`}>
                                {Math.round(r.score)}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate text-xs">
                            {r.inputUrl ?? r.inputAddress ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                            {new Date(r.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <a href={`${BASE}/reports/${r.id}`} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-primary">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </a>
                              {r.status !== "complete" && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90 text-white"
                                  disabled={simulatingId === r.id}
                                  onClick={() => handleSimulate(r.id)}
                                >
                                  {simulatingId === r.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Play className="h-3 w-3" />}
                                  {simulatingId === r.id ? "Running…" : "Simulate"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(reportsData?.reports ?? []).length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No reports yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Price Alerts tab */}
        {tab === "alerts" && (
          <div className="space-y-6">
            {alertsLoading ? (
              <div className="flex items-center gap-2 p-6 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading alerts…
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    icon={<Bell className="h-5 w-5 text-primary" />}
                    label="Active Alerts"
                    value={alertsData?.total ?? 0}
                    sub="price watchers"
                  />
                  <StatCard
                    icon={<MapPin className="h-5 w-5 text-blue-500" />}
                    label="Top Area"
                    value={alertsData?.demand.byNeighbourhood[0]?.neighbourhood ?? "—"}
                    sub={`${alertsData?.demand.byNeighbourhood[0]?.count ?? 0} alerts`}
                  />
                  <StatCard
                    icon={<Home className="h-5 w-5 text-amber-500" />}
                    label="Rental Alerts"
                    value={alertsData?.demand.byListingType.find((t) => t.listingType === "rent")?.count ?? 0}
                    sub="watching rent listings"
                  />
                  <StatCard
                    icon={<Building2 className="h-5 w-5 text-emerald-500" />}
                    label="Sale Alerts"
                    value={alertsData?.demand.byListingType.find((t) => t.listingType === "sale")?.count ?? 0}
                    sub="watching sale listings"
                  />
                </div>

                {/* Demand by neighbourhood */}
                {(alertsData?.demand.byNeighbourhood.length ?? 0) > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" /> Demand by Neighbourhood
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {alertsData!.demand.byNeighbourhood.slice(0, 10).map(({ neighbourhood, count }) => {
                        const max = alertsData!.demand.byNeighbourhood[0]?.count ?? 1;
                        const pct = Math.round((count / max) * 100);
                        return (
                          <div key={neighbourhood}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium text-slate-700 capitalize">{neighbourhood ?? "Unknown"}</span>
                              <span className="text-slate-500 text-xs">{count} alert{count !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Alerts table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Active Price Alerts</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">#</th>
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">Email</th>
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">Neighbourhood</th>
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">Type</th>
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">Max Price</th>
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">Min Beds</th>
                            <th className="text-left px-4 py-3 text-slate-500 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(alertsData?.alerts ?? []).map((a) => (
                            <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{a.id}</td>
                              <td className="px-4 py-3 text-slate-600 text-xs max-w-[160px] truncate">
                                {a.email ? a.email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, "·") + c) : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-700 capitalize">{a.neighbourhood ?? "—"}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${a.listingType === "rent" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {a.listingType ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-700 text-xs">
                                {a.maxPriceKsh != null ? `KSh ${a.maxPriceKsh.toLocaleString()}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{a.minBedrooms ?? "—"}</td>
                              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                                {new Date(a.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}
                              </td>
                            </tr>
                          ))}
                          {(alertsData?.alerts ?? []).length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                No active price alerts yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Scammers tab */}
        {tab === "scammers" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Scammer Registry</CardTitle></CardHeader>
            <CardContent className="p-0">
              {scammersLoading ? (
                <div className="flex items-center gap-2 p-6 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Phone</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Reports</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Status</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Notes</th>
                        <th className="text-left px-4 py-3 text-slate-500 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scammersData?.scammers ?? []).map((s) => (
                        <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-sm text-slate-800">{s.normalisedPhone}</td>
                          <td className="px-4 py-3 text-slate-700">{s.reportCount}</td>
                          <td className="px-4 py-3">
                            {s.isConfirmed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                <AlertTriangle className="h-3 w-3" /> Confirmed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                                <Clock className="h-3 w-3" /> Unconfirmed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{s.notes ?? "—"}</td>
                          <td className="px-4 py-3">
                            {s.isConfirmed ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={confirmMutation.isPending}
                                onClick={() => confirmMutation.mutate({ id: s.id, confirmed: false })}
                              >
                                <XCircle className="h-3 w-3" /> Unconfirm
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1 bg-red-600 hover:bg-red-700 text-white"
                                disabled={confirmMutation.isPending}
                                onClick={() => confirmMutation.mutate({ id: s.id, confirmed: true })}
                              >
                                <CheckCircle className="h-3 w-3" /> Confirm
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(scammersData?.scammers ?? []).length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No scammer entries.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</span></div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function StatusPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      {label} <strong>{count}</strong>
    </span>
  );
}
