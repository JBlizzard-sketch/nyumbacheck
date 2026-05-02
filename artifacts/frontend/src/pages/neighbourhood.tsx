import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/lib/use-page-meta";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, MapPin, Home, Building2, AlertTriangle, Clock,
  ArrowLeft, Loader2, BarChart3, Copy, MessageCircle
} from "lucide-react";
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

        {/* CTA */}
        <div className="mt-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
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
