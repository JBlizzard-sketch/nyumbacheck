import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePageMeta } from "@/lib/use-page-meta";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, MapPin, Home, Building2, AlertTriangle, Clock,
  ArrowLeft, ArrowRight, Loader2, BarChart3, Copy, MessageCircle,
  Bell, BellRing, X, CheckCircle, ShieldCheck, Shield
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MarketStats = {
  neighbourhood: string;
  listingType: string;
  period: string;
  activeListings: number;
  uniqueProperties: number;
  duplicateRate: number | null;
  medianPriceKsh: number | null;
  medianPricePerSqftKsh: number | null;
  p25PriceKsh: number | null;
  p75PriceKsh: number | null;
  medianDaysOnMarket: number | null;
  listingVelocityIndex: number | null;
  highFraudListings: number;
  avgFraudScore: number | null;
};

type TrendPoint = {
  date: string;
  medianPriceKsh: number | null;
  activeListings: number | null;
  newListings: number | null;
  medianDaysOnMarket: number | null;
};

function formatKsh(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `KSh ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `KSh ${Math.round(v / 1_000)}K`;
  return `KSh ${v.toLocaleString()}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-KE", { month: "short", day: "numeric" });
}

const LABEL: Record<string, string> = {
  westlands: "Westlands", kilimani: "Kilimani", karen: "Karen", langata: "Lang'ata",
  kileleshwa: "Kileleshwa", parklands: "Parklands", runda: "Runda",
  muthaiga: "Muthaiga", lavington: "Lavington", kasarani: "Kasarani",
  ruaka: "Ruaka", gigiri: "Gigiri",
};

// ── Recent Fraud Feed ─────────────────────────────────────────────────────────
type FeedEntry = {
  id: number;
  riskLevel: string | null;
  score: number | null;
  signalCount: number;
  createdAt: string;
};

const RISK_META: Record<string, { dot: string; label: string; text: string; bg: string; border: string }> = {
  critical: { dot: "bg-red-500",    label: "Critical", text: "text-red-700",    bg: "bg-red-50",    border: "border-red-100" },
  high:     { dot: "bg-orange-500", label: "High",     text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-100" },
  medium:   { dot: "bg-amber-400",  label: "Medium",   text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-100" },
  low:      { dot: "bg-green-500",  label: "Low",      text: "text-green-700",  bg: "bg-green-50",  border: "border-green-100" },
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function RecentFraudFeedSection({ slug, displayName }: { slug: string; displayName: string }) {
  const { data, isLoading } = useQuery<{ reports: FeedEntry[] }>({
    queryKey: ["neighbourhood-feed", slug],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/reports/recent-public?limit=5&neighbourhood=${encodeURIComponent(slug)}`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ reports: FeedEntry[] }>;
    },
    staleTime: 60_000,
    retry: false,
  });

  const reports = data?.reports ?? [];

  if (!isLoading && reports.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Recent Fraud Checks in {displayName}
          </CardTitle>
          <Link href="/fraud-feed">
            <button className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
              See all <ArrowRight className="h-3 w-3" />
            </button>
          </Link>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          Latest anonymised fraud reports checked in this area.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((entry) => {
              const meta = RISK_META[entry.riskLevel ?? "low"] ?? RISK_META.low;
              return (
                <Link key={entry.id} href={`/reports/${entry.id}`}>
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer hover:brightness-95 transition-all ${meta.border} ${meta.bg}`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                    <span className={`text-xs font-semibold flex-shrink-0 w-14 ${meta.text}`}>
                      {meta.label} Risk
                    </span>
                    <span className="text-xs text-slate-700 font-mono flex-shrink-0 w-14">
                      {entry.score != null ? `${Math.round(entry.score)}/100` : "—"}
                    </span>
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {entry.signalCount} signal{entry.signalCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto flex-shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgo(entry.createdAt)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Price Alert Card ──────────────────────────────────────────────────────────
type AlertRow = {
  id: number;
  neighbourhood: string;
  listingType: string;
  maxPriceKsh: number | null;
  minBedrooms: number | null;
  createdAt: string;
};

function NeighbourhoodAlertCard({
  neighbourhood,
  listingType,
  displayName,
}: {
  neighbourhood: string;
  listingType: "rent" | "sale";
  displayName: string;
}) {
  const { user } = useUser();
  const qc = useQueryClient();
  const userId = user?.id ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const [showForm, setShowForm] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("");

  const { data, isLoading } = useQuery<{ alerts: AlertRow[] }>({
    queryKey: ["nbhd-alerts", userId, neighbourhood, listingType],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/alerts?userId=${encodeURIComponent(userId)}`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<{ alerts: AlertRow[] }>;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const existing = (data?.alerts ?? []).filter(
    (a) => a.neighbourhood === neighbourhood && a.listingType === listingType,
  );

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email,
          neighbourhood,
          listingType,
          ...(maxPrice ? { maxPriceKsh: parseInt(maxPrice.replace(/,/g, ""), 10) } : {}),
          ...(bedrooms ? { minBedrooms: parseInt(bedrooms, 10) } : {}),
        }),
      });
      if (!r.ok) throw new Error("Failed to create alert");
      return r.json();
    },
    onSuccess: () => {
      toast.success("Price alert set! We'll email you when matching listings appear.");
      qc.invalidateQueries({ queryKey: ["nbhd-alerts"] });
      setShowForm(false);
      setMaxPrice("");
      setBedrooms("");
    },
    onError: () => toast.error("Failed to set alert — please try again."),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/alerts/${id}?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast.success("Alert removed.");
      qc.invalidateQueries({ queryKey: ["nbhd-alerts"] });
    },
  });

  // Not signed in
  if (!userId) {
    return (
      <div className="mt-6 flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
        <Bell className="h-5 w-5 flex-shrink-0 text-slate-400" />
        <span>
          <Link href="/sign-in" className="text-primary font-medium hover:underline">Sign in</Link>
          {" "}to set price alerts for {displayName} — we'll email you when new listings match your criteria.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-6 p-5 border border-primary/20 bg-primary/5 rounded-2xl">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-slate-800">
            Price Alerts — {displayName}
          </span>
          {existing.length > 0 && (
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              {existing.length} active
            </Badge>
          )}
        </div>
        {!showForm && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-8 border-primary/30 hover:bg-primary/5 text-primary"
            onClick={() => setShowForm(true)}
          >
            <Bell className="h-3.5 w-3.5" /> Set Alert
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading alerts…
        </div>
      )}

      {/* Existing alerts for this neighbourhood + type */}
      {existing.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 p-3 bg-white border border-primary/15 rounded-lg mb-2 text-sm"
        >
          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex-1 text-slate-700 text-xs">
            <span className="font-medium capitalize">{a.neighbourhood}</span>
            {" · "}
            <span className="capitalize">{a.listingType}</span>
            {a.maxPriceKsh != null && (
              <span> · Max KSh {a.maxPriceKsh.toLocaleString()}</span>
            )}
            {a.minBedrooms != null && <span> · {a.minBedrooms}+ bed</span>}
          </div>
          <button
            onClick={() => remove.mutate(a.id)}
            disabled={remove.isPending}
            className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
            title="Remove alert"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Empty state */}
      {!isLoading && existing.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 mb-1">
          No active alerts for {displayName} {listingType} listings.
          We'll email you when new listings match your criteria.
        </p>
      )}

      {/* Create form */}
      {showForm && (
        <div className="pt-3 border-t border-primary/10 space-y-3">
          <p className="text-xs text-slate-600 font-medium">
            Alert criteria — <span className="capitalize text-primary">{displayName}</span>{" "}
            {listingType === "rent" ? "rentals" : "for sale"}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Max price (KSh) <span className="text-slate-400 font-normal">optional</span>
              </label>
              <Input
                placeholder={listingType === "rent" ? "e.g. 80000" : "e.g. 8000000"}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-9 text-sm"
                type="number"
                min={0}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Min bedrooms <span className="text-slate-400 font-normal">optional</span>
              </label>
              <Input
                placeholder="e.g. 2"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                className="h-9 text-sm"
                type="number"
                min={0}
                max={10}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              Create Alert
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-500"
              onClick={() => { setShowForm(false); setMaxPrice(""); setBedrooms(""); }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Alerts are sent to {email} · Max one email per 24 hours
          </p>
        </div>
      )}
    </div>
  );
}

export default function NeighbourhoodPage() {
  const { slug } = useParams<{ slug: string }>();
  const [listingType, setListingType] = useState<"rent" | "sale">("rent");

  const displayName = LABEL[slug ?? ""] ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "");

  usePageMeta(
    slug
      ? {
          title: `${displayName} Property Market`,
          description: `Real-time rental and sale prices, fraud rates, and listing trends for ${displayName}, Nairobi. Updated market data from NyumbaCheck.`,
          ogType: "article",
        }
      : null
  );

  const statsQuery = useQuery<MarketStats>({
    queryKey: ["nbhd-stats", slug, listingType],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/stats?neighbourhood=${slug}&listingType=${listingType}&days=30`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<MarketStats>;
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const trendsQuery = useQuery<{ dataPoints: TrendPoint[] }>({
    queryKey: ["nbhd-trends", slug, listingType],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/trends?neighbourhood=${slug}&listingType=${listingType}&days=90`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<{ dataPoints: TrendPoint[] }>;
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const stats = statsQuery.data;
  const trends = trendsQuery.data?.dataPoints ?? [];
  const loading = statsQuery.isLoading;

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const waText = stats
    ? `${displayName} ${listingType} market: median ${formatKsh(stats.medianPriceKsh)}/mo · ${stats.activeListings} active listings · ${Math.round((stats.avgFraudScore ?? 0))}% avg fraud score. Check it on NyumbaCheck: ${shareUrl}`
    : shareUrl;

  const fraudColor =
    (stats?.avgFraudScore ?? 0) >= 60 ? "text-red-600" :
    (stats?.avgFraudScore ?? 0) >= 35 ? "text-amber-600" : "text-green-600";

  const fraudBg =
    (stats?.avgFraudScore ?? 0) >= 60 ? "bg-red-50 border-red-200" :
    (stats?.avgFraudScore ?? 0) >= 35 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200";

  if (!slug) {
    return (
      <Layout>
        <div className="text-center py-24 text-slate-400">
          <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No neighbourhood specified.</p>
          <Link href="/market"><Button variant="outline" className="mt-4">View Market Intelligence</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <Link href="/market">
          <button className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Market Intelligence
          </button>
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-5 w-5 text-primary" />
              <h1 className="text-3xl font-bold text-slate-900">{displayName}</h1>
            </div>
            <p className="text-slate-500 text-sm">
              Nairobi · Real-time property market data
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Listing type toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(["rent", "sale"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setListingType(t)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    listingType === t ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t === "rent" ? "For Rent" : "For Sale"}
                </button>
              ))}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copied")); }}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
              title="Copy link"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener")}
              className="p-2 rounded-lg border border-slate-200 hover:bg-[#25D366]/10 text-[#25D366] transition-colors"
              title="Share on WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
          </div>
        ) : !stats || (stats.activeListings === 0 && stats.medianPriceKsh == null) ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-400">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No market data available for {displayName} yet.</p>
              <Link href="/market">
                <Button variant="outline" className="mt-4">Browse other neighbourhoods</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Key metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                {
                  icon: Home,
                  label: listingType === "rent" ? "Median Rent/mo" : "Median Sale Price",
                  value: formatKsh(stats.medianPriceKsh),
                  sub: `Range: ${formatKsh(stats.p25PriceKsh)} – ${formatKsh(stats.p75PriceKsh)}`,
                  accent: true,
                },
                {
                  icon: Building2,
                  label: "Active Listings",
                  value: String(stats.activeListings),
                  sub: `${stats.uniqueProperties} unique properties`,
                },
                {
                  icon: Clock,
                  label: "Avg Days on Market",
                  value: stats.medianDaysOnMarket != null ? `${Math.round(stats.medianDaysOnMarket)} days` : "—",
                  sub: "Median time to fill",
                },
                {
                  icon: AlertTriangle,
                  label: "Avg Fraud Score",
                  value: stats.avgFraudScore != null ? `${Math.round(stats.avgFraudScore)}/100` : "—",
                  sub: `${stats.highFraudListings} high-risk listings`,
                  risk: true,
                },
              ].map(({ icon: Icon, label, value, sub, accent, risk }) => (
                <Card key={label} className={risk && (stats.avgFraudScore ?? 0) >= 60 ? "border-red-200" : ""}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 flex-shrink-0 ${risk ? fraudColor : "text-primary"}`} />
                      <p className="text-xs text-slate-500">{label}</p>
                    </div>
                    <p className={`text-xl font-bold leading-tight ${accent ? "text-primary" : risk ? fraudColor : "text-slate-900"}`}>
                      {value}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Fraud alert */}
            {(stats.avgFraudScore ?? 0) >= 40 && (
              <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 mb-6 ${fraudBg}`}>
                <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${fraudColor}`} />
                <div>
                  <p className={`text-sm font-semibold ${fraudColor}`}>
                    Elevated fraud risk in {displayName}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {stats.highFraudListings} high-risk listings detected. Always verify agent credentials and run a fraud report before paying a deposit.
                  </p>
                  <Link href="/check">
                    <button className="text-xs text-primary font-medium mt-1.5 hover:underline">
                      Run a fraud check on a listing →
                    </button>
                  </Link>
                </div>
              </div>
            )}

            {/* Duplicate rate badge */}
            {stats.duplicateRate != null && (
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <Badge
                  className={`text-xs border px-3 py-1 ${
                    stats.duplicateRate >= 0.3
                      ? "bg-red-100 text-red-800 border-red-200"
                      : stats.duplicateRate >= 0.15
                      ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-green-100 text-green-800 border-green-200"
                  }`}
                >
                  {Math.round(stats.duplicateRate * 100)}% duplicate listing rate
                </Badge>
                {stats.listingVelocityIndex != null && (
                  <Badge variant="outline" className="text-xs px-3 py-1">
                    Velocity index: {stats.listingVelocityIndex.toFixed(2)}
                  </Badge>
                )}
                {stats.medianPricePerSqftKsh != null && (
                  <Badge variant="outline" className="text-xs px-3 py-1">
                    {formatKsh(stats.medianPricePerSqftKsh)} / sqft
                  </Badge>
                )}
              </div>
            )}

            {/* Price trend chart */}
            {trends.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    {listingType === "rent" ? "Median Rent" : "Median Sale Price"} — Last 90 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trends} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1a3a2a" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#1a3a2a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => `${Math.round(v / 1000)}K`}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                        width={42}
                      />
                      <Tooltip
                        formatter={(v: number) => [formatKsh(v), listingType === "rent" ? "Median Rent" : "Median Price"]}
                        labelFormatter={formatDate}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="medianPriceKsh"
                        stroke="#1a3a2a"
                        strokeWidth={2}
                        fill="url(#priceGrad)"
                        dot={false}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Active listings chart */}
            {trends.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Active Listings Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={trends} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="listGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={32} />
                      <Tooltip
                        formatter={(v: number) => [v, "Active Listings"]}
                        labelFormatter={formatDate}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Area type="monotone" dataKey="activeListings" stroke="#10b981" strokeWidth={2} fill="url(#listGrad)" dot={false} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Recent fraud checks for this neighbourhood */}
        <RecentFraudFeedSection slug={slug ?? ""} displayName={displayName} />

        {/* Price Alert Card */}
        <NeighbourhoodAlertCard
          neighbourhood={slug ?? ""}
          listingType={listingType}
          displayName={displayName}
        />

        {/* CTA */}
        <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-900 text-sm">Checking a listing in {displayName}?</p>
            <p className="text-xs text-slate-500 mt-0.5">Run a full fraud analysis on any property URL or address for KSh 500.</p>
          </div>
          <Link href="/check">
            <Button className="gap-2 flex-shrink-0">Check a Property</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
