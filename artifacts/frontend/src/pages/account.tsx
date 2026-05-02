import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/use-page-meta";
import {
  ShieldCheck, FileText, Bell, TrendingUp, CheckCircle, Clock,
  AlertTriangle, XCircle, Trash2, ExternalLink, MapPin, ArrowRight,
  User, CreditCard, Lock
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Report = {
  id: number;
  status: string;
  inputUrl: string | null;
  inputAddress: string | null;
  createdAt: string;
  score: number | null;
  riskLevel: string | null;
};

type Alert = {
  id: number;
  neighbourhood: string;
  listingType: "rent" | "sale";
  maxPriceKsh: number | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  complete:         { label: "Complete",         icon: CheckCircle,   color: "text-green-600" },
  processing:       { label: "Processing",       icon: Clock,         color: "text-blue-500" },
  pending:          { label: "Pending",           icon: Clock,         color: "text-amber-500" },
  awaiting_payment: { label: "Awaiting Payment", icon: CreditCard,    color: "text-purple-500" },
  failed:           { label: "Failed",           icon: XCircle,       color: "text-red-500" },
};

const RISK_META: Record<string, { label: string; bg: string; text: string }> = {
  critical: { label: "Critical", bg: "bg-red-100", text: "text-red-800" },
  high:     { label: "High",     bg: "bg-orange-100", text: "text-orange-800" },
  medium:   { label: "Medium",   bg: "bg-amber-100",  text: "text-amber-800" },
  low:      { label: "Low",      bg: "bg-green-100",  text: "text-green-800" },
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function AvatarCircle({ name, email, size = "lg" }: { name?: string; email?: string; size?: "sm" | "lg" }) {
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (email?.[0] ?? "?").toUpperCase();
  const dim = size === "lg" ? "w-16 h-16 text-2xl" : "w-10 h-10 text-base";
  return (
    <div className={`${dim} rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function StatCard({ icon: Icon, value, label, color = "text-primary" }: { icon: React.ElementType; value: string | number; label: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1.5 ${color}`} />
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

export default function AccountPage() {
  const { user, isLoaded } = useUser();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  usePageMeta({ title: "My Account — NyumbaCheck" });

  const userId = user?.id;

  const { data: reportsData, isLoading: reportsLoading } = useQuery<{ reports: Report[] }>({
    queryKey: ["account-reports", userId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/reports/mine?userId=${userId}`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ reports: Report[] }>;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["account-alerts", userId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/alerts?userId=${userId}`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ alerts: Alert[] }>;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const deleteAlert = useMutation({
    mutationFn: async (alertId: number) => {
      const r = await fetch(`${BASE}/api/alerts/${alertId}?userId=${userId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
    },
    onMutate: (alertId) => setDeletingId(alertId),
    onSuccess: () => {
      toast.success("Price alert removed");
      qc.invalidateQueries({ queryKey: ["account-alerts", userId] });
    },
    onError: () => toast.error("Failed to remove alert"),
    onSettled: () => setDeletingId(null),
  });

  const reports = reportsData?.reports ?? [];
  const alerts = alertsData?.alerts ?? [];

  const completeReports = reports.filter((r) => r.status === "complete");
  const highRiskCount   = completeReports.filter((r) => r.riskLevel === "high" || r.riskLevel === "critical").length;

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-KE", { month: "long", year: "numeric" })
    : "—";

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined;

  if (!isLoaded) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-4xl space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <Lock className="h-12 w-12 text-primary mx-auto mb-4 opacity-40" />
          <h1 className="text-2xl font-bold mb-2">Sign in to view your account</h1>
          <p className="text-slate-500 mb-6">Your reports, alerts, and payment history live here.</p>
          <Link href="/sign-in"><Button size="lg">Sign In</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-4xl space-y-6">
        {/* Profile header */}
        <div className="bg-primary text-primary-foreground rounded-2xl p-6 flex items-center gap-5">
          <AvatarCircle name={fullName} email={user.primaryEmailAddress?.emailAddress} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{fullName ?? user.primaryEmailAddress?.emailAddress}</h1>
            {fullName && <p className="text-primary-foreground/70 text-sm truncate">{user.primaryEmailAddress?.emailAddress}</p>}
            <p className="text-primary-foreground/60 text-xs mt-1">Member since {memberSince}</p>
          </div>
          <Link href="/check">
            <Button className="bg-white text-primary hover:bg-slate-100 gap-1.5 flex-shrink-0 hidden sm:flex">
              New Check <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={FileText} value={reportsLoading ? "…" : reports.length} label="Reports run" />
          <StatCard icon={CheckCircle} value={reportsLoading ? "…" : completeReports.length} label="Completed" color="text-green-600" />
          <StatCard icon={AlertTriangle} value={reportsLoading ? "…" : highRiskCount} label="High risk found" color="text-red-500" />
          <StatCard icon={Bell} value={alertsLoading ? "…" : alerts.length} label="Active alerts" color="text-blue-500" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="reports">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="reports" className="gap-1.5">
              <FileText className="h-4 w-4" /> My Reports
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5">
              <Bell className="h-4 w-4" /> Price Alerts
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-4 w-4" /> Profile
            </TabsTrigger>
          </TabsList>

          {/* ── My Reports tab ── */}
          <TabsContent value="reports" className="mt-4">
            {reportsLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No reports yet.</p>
                <Link href="/check"><Button className="mt-4 gap-1.5">Check a Property <ArrowRight className="h-4 w-4" /></Button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map((rep) => {
                  const sm = STATUS_META[rep.status] ?? STATUS_META.pending;
                  const StatusIcon = sm.icon;
                  const rm = rep.riskLevel ? (RISK_META[rep.riskLevel] ?? null) : null;
                  const inputDisplay = rep.inputUrl
                    ? (() => { try { return new URL(rep.inputUrl).hostname + "…"; } catch { return rep.inputUrl.slice(0, 40) + "…"; } })()
                    : rep.inputAddress ? rep.inputAddress.slice(0, 45) + (rep.inputAddress.length > 45 ? "…" : "") : "—";
                  return (
                    <Link key={rep.id} href={`/reports/${rep.id}`}>
                      <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group">
                        <StatusIcon className={`h-5 w-5 flex-shrink-0 ${sm.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{inputDisplay}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{timeAgo(rep.createdAt)} · {sm.label}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {rm && rep.score != null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rm.bg} ${rm.text}`}>
                              {Math.round(rep.score)}/100
                            </span>
                          )}
                          <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Price Alerts tab ── */}
          <TabsContent value="alerts" className="mt-4">
            {alertsLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No active price alerts.</p>
                <p className="text-sm mt-1">Set alerts from the Market Intelligence page to be notified when prices drop.</p>
                <Link href="/market"><Button variant="outline" className="mt-4 gap-1.5"><TrendingUp className="h-4 w-4" /> Browse Market</Button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-3 bg-white border border-slate-100 rounded-xl p-4">
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold text-slate-800 capitalize">{alert.neighbourhood}</p>
                        <Badge className="text-xs capitalize bg-slate-100 text-slate-600 border-0">{alert.listingType}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {alert.maxPriceKsh != null && `Max KSh ${alert.maxPriceKsh.toLocaleString()}`}
                        {alert.minBedrooms != null && ` · ${alert.minBedrooms}+ bed`}
                        {alert.maxBedrooms != null && alert.minBedrooms != null && alert.maxBedrooms > alert.minBedrooms && `–${alert.maxBedrooms} bed`}
                        {" · "}Set {formatDate(alert.createdAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-500 flex-shrink-0"
                      disabled={deletingId === alert.id}
                      onClick={() => deleteAlert.mutate(alert.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Profile tab ── */}
          <TabsContent value="profile" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Account Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 py-3 border-b border-slate-100">
                  <AvatarCircle name={fullName} email={user.primaryEmailAddress?.emailAddress} size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{fullName ?? "—"}</p>
                    <p className="text-xs text-slate-500">{user.primaryEmailAddress?.emailAddress}</p>
                  </div>
                </div>
                {[
                  { label: "Email", value: user.primaryEmailAddress?.emailAddress ?? "—" },
                  { label: "Member since", value: memberSince },
                  { label: "User ID", value: user.id.slice(0, 16) + "…" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-2 border-b border-slate-50 text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-800 font-medium">{value}</span>
                  </div>
                ))}
                <div className="pt-2 flex gap-2 flex-wrap">
                  <a href={`${BASE}/sign-in`} target="_self">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ShieldCheck className="h-4 w-4" /> Manage account via Clerk
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
