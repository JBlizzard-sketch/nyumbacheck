import { useState } from "react";
import { useListNeighbourhoods, useGetMarketStats, useGetMarketTrends } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Home, Clock, BarChart2, Bell, BellRing, X, Loader2, BellOff, Scale, AlertTriangle, ShieldAlert, ArrowRight, ShieldCheck, Shield } from "lucide-react";
import { Link } from "wouter";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatKsh(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `KSh ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `KSh ${(val / 1_000).toFixed(0)}K`;
  return `KSh ${val.toLocaleString()}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type PriceAlert = {
  id: number;
  neighbourhood: string;
  listingType: string;
  maxPriceKsh: number | null;
  minBedrooms: number | null;
  createdAt: string;
};

function PriceAlertSection({
  neighbourhood,
  listingType,
  userId,
  email,
}: {
  neighbourhood: string;
  listingType: "rent" | "sale";
  userId: string;
  email: string;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("");

  const { data, isLoading } = useQuery<{ alerts: PriceAlert[] }>({
    queryKey: ["alerts", userId, neighbourhood, listingType],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/alerts?userId=${encodeURIComponent(userId)}`);
      return r.json() as Promise<{ alerts: PriceAlert[] }>;
    },
    enabled: !!userId && !!neighbourhood,
    staleTime: 30_000,
  });

  const existing = (data?.alerts ?? []).filter(
    (a) => a.neighbourhood === neighbourhood && a.listingType === listingType
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
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setShowForm(false);
      setMaxPrice("");
      setBedrooms("");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/alerts/${id}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  if (!userId) {
    return (
      <div className="flex items-center gap-2 mt-4 text-sm text-slate-400">
        <Bell className="h-4 w-4" />
        <span>Sign in to set price alerts for this neighbourhood.</span>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-slate-700">Price Alerts</span>
          {existing.length > 0 && (
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{existing.length} active</Badge>
          )}
        </div>
        {!showForm && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-8"
            onClick={() => setShowForm(true)}
          >
            <Bell className="h-3.5 w-3.5" /> Set Alert
          </Button>
        )}
      </div>

      {/* Existing alerts */}
      {isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading alerts…
        </div>
      )}
      {existing.map((a) => (
        <div key={a.id} className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/15 rounded-lg mb-2 text-sm">
          <BellRing className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex-1 text-slate-700">
            <span className="font-medium capitalize">{a.neighbourhood}</span>
            {" · "}
            <span className="capitalize">{a.listingType}</span>
            {a.maxPriceKsh && <span> · Max {formatKsh(a.maxPriceKsh)}</span>}
            {a.minBedrooms != null && <span> · {a.minBedrooms}+ BR</span>}
          </div>
          <button
            onClick={() => remove.mutate(a.id)}
            disabled={remove.isPending}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {existing.length === 0 && !isLoading && !showForm && (
        <p className="text-xs text-slate-400 mb-2">No alerts for this neighbourhood. Set one to get notified when prices drop.</p>
      )}

      {/* Create form */}
      {showForm && (
        <div className="p-4 border border-primary/20 rounded-xl bg-primary/5 space-y-3">
          <p className="text-sm font-medium text-slate-700">
            Alert for <span className="capitalize text-primary">{neighbourhood}</span> · {listingType === "rent" ? "rental" : "sale"} market
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Max price (KSh)</label>
              <Input
                placeholder="e.g. 80000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Min bedrooms</label>
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
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
              Create Alert
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            You'll be notified at <strong>{email}</strong> when new listings match these criteria.
          </p>
        </div>
      )}
    </div>
  );
}

type CompareRow = { slug: string; name: string; medianPriceKsh: number | null; activeListings: number; avgFraudScore: number | null };

function NeighbourhoodCompareChart({
  listingType,
  activeSlug,
  onSelect,
}: {
  listingType: "rent" | "sale";
  activeSlug: string;
  onSelect: (slug: string) => void;
}) {
  const { data, isLoading } = useQuery<{ neighbourhoods: CompareRow[] }>({
    queryKey: ["market-compare", listingType],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/compare?listingType=${listingType}`);
      return r.json() as Promise<{ neighbourhoods: CompareRow[] }>;
    },
    staleTime: 5 * 60_000,
  });

  const rows = (data?.neighbourhoods ?? []).filter((r) => r.medianPriceKsh != null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (rows.length === 0) return (
    <div className="h-64 flex items-center justify-center text-slate-400">No comparison data yet.</div>
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}
        onClick={(d) => { if (d?.activePayload?.[0]) onSelect((d.activePayload[0].payload as CompareRow).slug); }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          interval={0}
          height={55}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          tickFormatter={(v) => formatKsh(v)}
          width={75}
        />
        <Tooltip
          formatter={(value) => [formatKsh(Number(value)), "Median Price"]}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          cursor={{ fill: "rgba(26,58,42,0.06)" }}
        />
        <Bar dataKey="medianPriceKsh" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {rows.map((row) => (
            <Cell
              key={row.slug}
              fill={row.slug === activeSlug ? "#1a3a2a" : "#86efac"}
              cursor="pointer"
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Neighbourhood Safety Rankings ─────────────────────────────────────────────
function safetyGrade(score: number | null): { grade: string; color: string; bg: string; bar: string } {
  if (score == null) return { grade: "?", color: "text-slate-400", bg: "bg-slate-100", bar: "#94a3b8" };
  if (score < 20) return { grade: "A", color: "text-green-700", bg: "bg-green-100", bar: "#22c55e" };
  if (score < 35) return { grade: "B", color: "text-lime-700", bg: "bg-lime-100", bar: "#84cc16" };
  if (score < 50) return { grade: "C", color: "text-amber-700", bg: "bg-amber-100", bar: "#f59e0b" };
  if (score < 65) return { grade: "D", color: "text-orange-700", bg: "bg-orange-100", bar: "#f97316" };
  return { grade: "F", color: "text-red-700", bg: "bg-red-100", bar: "#ef4444" };
}

function NeighbourhoodSafetyRankings({ listingType }: { listingType: "rent" | "sale" }) {
  const { data, isLoading } = useQuery<{ neighbourhoods: CompareRow[] }>({
    queryKey: ["market-compare", listingType],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/compare?listingType=${listingType}`);
      return r.json() as Promise<{ neighbourhoods: CompareRow[] }>;
    },
  });

  const rows = [...(data?.neighbourhoods ?? [])]
    .filter((r) => r.avgFraudScore != null)
    .sort((a, b) => (a.avgFraudScore ?? 100) - (b.avgFraudScore ?? 100));

  if (!isLoading && rows.length === 0) return null;

  const safest = rows[0];
  const riskiest = rows[rows.length - 1];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5 text-primary" />
          Fraud Safety Rankings
        </CardTitle>
        <p className="text-sm text-slate-500 mt-0.5">
          Nairobi neighbourhoods ranked safest → riskiest based on fraud scores across all analysed listings.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {/* Summary pills */}
            {safest && riskiest && (
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-green-800 font-medium">Safest: {safest.name}</span>
                  <span className="text-green-600">{Math.round(safest.avgFraudScore ?? 0)}/100</span>
                </div>
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs">
                  <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-red-800 font-medium">Highest risk: {riskiest.name}</span>
                  <span className="text-red-600">{Math.round(riskiest.avgFraudScore ?? 0)}/100</span>
                </div>
              </div>
            )}

            {/* Rankings table */}
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              {rows.map((row, idx) => {
                const g = safetyGrade(row.avgFraudScore);
                const pct = Math.round(row.avgFraudScore ?? 0);
                return (
                  <Link key={row.slug} href={`/neighbourhood/${row.slug}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0 group">
                      {/* Rank */}
                      <span className="flex-shrink-0 w-5 text-xs text-slate-400 font-medium text-right">
                        {idx + 1}
                      </span>

                      {/* Grade badge */}
                      <span
                        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${g.color} ${g.bg}`}
                      >
                        {g.grade}
                      </span>

                      {/* Name */}
                      <span className="flex-1 text-sm font-medium text-slate-800 group-hover:text-primary transition-colors">
                        {row.name}
                      </span>

                      {/* Score bar */}
                      <div className="flex-shrink-0 w-28 hidden sm:flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: g.bar }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-10 text-right flex-shrink-0">
                          {pct}/100
                        </span>
                      </div>

                      {/* Median price */}
                      <span className="flex-shrink-0 text-xs text-slate-500 hidden md:block w-20 text-right">
                        {formatKsh(row.medianPriceKsh)}
                      </span>

                      {/* Listings */}
                      <span className="flex-shrink-0 text-xs text-slate-400 w-14 text-right">
                        {row.activeListings.toLocaleString()} listings
                      </span>

                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-primary flex-shrink-0 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 mt-3 text-center">
              Click any row to view detailed market data for that neighbourhood
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type MarketStats = {
  medianPriceKsh: number | null;
  activeListings: number;
  medianDaysOnMarket: number | null;
  medianPricePerSqftKsh: number | null;
  duplicateRate: number | null;
  avgFraudScore: number | null;
  highFraudListings: number;
};

type NbhdOption = { slug: string; name: string };

function ComparePanel({
  listingType,
  neighbourhoods,
}: {
  listingType: "rent" | "sale";
  neighbourhoods: NbhdOption[];
}) {
  const [slugA, setSlugA] = useState("");
  const [slugB, setSlugB] = useState("");

  const fetchStats = async (slug: string) => {
    const r = await fetch(
      `${BASE}/api/market/stats?neighbourhood=${slug}&listingType=${listingType}&days=30`
    );
    if (!r.ok) throw new Error("failed");
    return r.json() as Promise<MarketStats>;
  };

  const { data: statsA, isLoading: loadingA } = useQuery<MarketStats>({
    queryKey: ["cmp-a", slugA, listingType],
    queryFn: () => fetchStats(slugA),
    enabled: !!slugA,
    staleTime: 5 * 60_000,
  });

  const { data: statsB, isLoading: loadingB } = useQuery<MarketStats>({
    queryKey: ["cmp-b", slugB, listingType],
    queryFn: () => fetchStats(slugB),
    enabled: !!slugB,
    staleTime: 5 * 60_000,
  });

  const nameA = neighbourhoods.find((n) => n.slug === slugA)?.name ?? slugA;
  const nameB = neighbourhoods.find((n) => n.slug === slugB)?.name ?? slugB;
  const bothSelected = !!slugA && !!slugB;

  type MetricDef = {
    label: string;
    icon: React.ElementType;
    valueA: number | null;
    valueB: number | null;
    format: (v: number) => string;
    lowerIsBetter: boolean;
    tooltip?: string;
  };

  const metrics: MetricDef[] = [
    {
      label: "Median Price",
      icon: Home,
      valueA: statsA?.medianPriceKsh ?? null,
      valueB: statsB?.medianPriceKsh ?? null,
      format: (v) => formatKsh(v),
      lowerIsBetter: true,
      tooltip: "Lower = more affordable",
    },
    {
      label: "Avg Fraud Score",
      icon: ShieldAlert,
      valueA: statsA?.avgFraudScore ?? null,
      valueB: statsB?.avgFraudScore ?? null,
      format: (v) => `${Math.round(v)}/100`,
      lowerIsBetter: true,
      tooltip: "Lower = safer market",
    },
    {
      label: "Active Listings",
      icon: BarChart2,
      valueA: statsA?.activeListings ?? null,
      valueB: statsB?.activeListings ?? null,
      format: (v) => v.toLocaleString(),
      lowerIsBetter: false,
      tooltip: "Higher = more choice",
    },
    {
      label: "Days on Market",
      icon: Clock,
      valueA: statsA?.medianDaysOnMarket ?? null,
      valueB: statsB?.medianDaysOnMarket ?? null,
      format: (v) => `${Math.round(v)}d`,
      lowerIsBetter: true,
      tooltip: "Lower = more demand",
    },
    {
      label: "Price / sqft",
      icon: TrendingUp,
      valueA: statsA?.medianPricePerSqftKsh ?? null,
      valueB: statsB?.medianPricePerSqftKsh ?? null,
      format: (v) => `KSh ${Math.round(v).toLocaleString()}`,
      lowerIsBetter: true,
    },
    {
      label: "Duplicate Rate",
      icon: AlertTriangle,
      valueA: statsA?.duplicateRate ?? null,
      valueB: statsB?.duplicateRate ?? null,
      format: (v) => `${(v * 100).toFixed(1)}%`,
      lowerIsBetter: true,
      tooltip: "Lower = cleaner listings",
    },
  ];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-5 w-5 text-primary" />
          Head-to-Head Comparison
        </CardTitle>
        <p className="text-sm text-slate-500">
          Pick two neighbourhoods to see their key market metrics side-by-side.
          {" "}<span className="text-green-700 font-medium">✓ Green</span> = better value.
        </p>
      </CardHeader>
      <CardContent>
        {/* Selectors */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { label: "Neighbourhood A", value: slugA, onChange: setSlugA, other: slugB, color: "text-primary" },
            { label: "Neighbourhood B", value: slugB, onChange: setSlugB, other: slugA, color: "text-slate-600" },
          ].map(({ label, value, onChange, other, color }) => (
            <div key={label}>
              <label className={`text-xs font-semibold mb-1.5 block ${color}`}>{label}</label>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {neighbourhoods.map((n) => (
                    <SelectItem key={n.slug} value={n.slug} disabled={n.slug === other}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {!bothSelected ? (
          <div className="text-center py-8 text-slate-400">
            <Scale className="h-10 w-10 mx-auto mb-2 opacity-25" />
            <p className="text-sm">Select both neighbourhoods to see the comparison.</p>
          </div>
        ) : (
          <>
            {/* VS header */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-4 text-center">
              <div className="bg-primary/8 rounded-xl py-2 px-3">
                <p className="text-xs text-slate-400 font-medium">A</p>
                <p className="font-bold text-primary text-sm">{nameA}</p>
              </div>
              <div className="text-xs font-bold text-slate-300 px-1">VS</div>
              <div className="bg-slate-50 rounded-xl py-2 px-3">
                <p className="text-xs text-slate-400 font-medium">B</p>
                <p className="font-bold text-slate-600 text-sm">{nameB}</p>
              </div>
            </div>

            {/* Metric rows */}
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              {metrics.map((m, idx) => {
                const { valueA, valueB, format, lowerIsBetter, label, icon: Icon } = m;
                let aWins = false, bWins = false;
                if (valueA != null && valueB != null && valueA !== valueB) {
                  aWins = lowerIsBetter ? valueA < valueB : valueA > valueB;
                  bWins = !aWins;
                }

                const cellA = loadingA ? (
                  <Skeleton className="h-6 w-16 mx-auto rounded-lg" />
                ) : valueA != null ? (
                  <span className={`inline-block text-sm font-semibold px-2.5 py-0.5 rounded-lg ${aWins ? "bg-green-100 text-green-800" : bWins ? "bg-amber-50 text-amber-700" : "text-slate-700"}`}>
                    {aWins && <span className="mr-0.5">✓</span>}{format(valueA)}
                  </span>
                ) : <span className="text-slate-300 text-sm">—</span>;

                const cellB = loadingB ? (
                  <Skeleton className="h-6 w-16 mx-auto rounded-lg" />
                ) : valueB != null ? (
                  <span className={`inline-block text-sm font-semibold px-2.5 py-0.5 rounded-lg ${bWins ? "bg-green-100 text-green-800" : aWins ? "bg-amber-50 text-amber-700" : "text-slate-700"}`}>
                    {bWins && <span className="mr-0.5">✓</span>}{format(valueB)}
                  </span>
                ) : <span className="text-slate-300 text-sm">—</span>;

                return (
                  <div
                    key={label}
                    className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                  >
                    <div className="text-center">{cellA}</div>
                    <div className="flex flex-col items-center gap-0.5 min-w-[90px]">
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
                    </div>
                    <div className="text-center">{cellB}</div>
                  </div>
                );
              })}
            </div>

            {/* Quick-links to full pages */}
            <div className="flex gap-3 mt-4">
              {[{ slug: slugA, name: nameA }, { slug: slugB, name: nameB }].map(({ slug, name }) => (
                <a
                  key={slug}
                  href={`/neighbourhood/${slug}`}
                  className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-primary border border-primary/20 rounded-lg py-2 hover:bg-primary/5 transition-colors"
                >
                  {name} <ArrowRight className="h-3 w-3" />
                </a>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function MarketPage() {
  const [neighbourhood, setNeighbourhood] = useState<string>("");
  const [listingType, setListingType] = useState<"rent" | "sale">("rent");
  const [days, setDays] = useState<number>(30);

  const { user } = useUser();
  const userId = user?.id ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const { data: nbhds, isLoading: nbhdsLoading } = useListNeighbourhoods();

  const { data: stats, isLoading: statsLoading } = useGetMarketStats(
    { neighbourhood, listingType, days },
    { query: { enabled: !!neighbourhood } },
  );

  const { data: trends, isLoading: trendsLoading } = useGetMarketTrends(
    { neighbourhood, listingType, days: 90 },
    { query: { enabled: !!neighbourhood } },
  );

  const chartData = (trends?.dataPoints ?? []).map((dp) => ({
    date: new Date(dp.date).toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
    price: dp.medianPriceKsh,
    listings: dp.activeListings,
  }));

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Market Intelligence
          </h1>
          <p className="text-slate-600">Real-time price trends and market stats for Nairobi neighbourhoods.</p>
        </div>

        <div className="flex flex-wrap gap-4 mb-8">
          <div className="flex-1 min-w-[200px]">
            <Select
              value={neighbourhood}
              onValueChange={setNeighbourhood}
              disabled={nbhdsLoading}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={nbhdsLoading ? "Loading..." : "Select neighbourhood"} />
              </SelectTrigger>
              <SelectContent>
                {(nbhds?.neighbourhoods ?? []).map((n) => (
                  <SelectItem key={n.slug} value={n.slug}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={listingType} onValueChange={(v) => setListingType(v as "rent" | "sale")}>
            <SelectTrigger className="h-11 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rent">For Rent</SelectItem>
              <SelectItem value="sale">For Sale</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-11 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Neighbourhood comparison bar chart — always visible */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              Neighbourhood Price Comparison
            </CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">
              Median {listingType === "rent" ? "rental" : "sale"} price across all tracked Nairobi neighbourhoods.
              Click a bar to drill into that neighbourhood.
            </p>
          </CardHeader>
          <CardContent>
            <NeighbourhoodCompareChart
              listingType={listingType}
              activeSlug={neighbourhood}
              onSelect={setNeighbourhood}
            />
          </CardContent>
        </Card>

        {/* Fraud Safety Rankings */}
        <NeighbourhoodSafetyRankings listingType={listingType} />

        {/* Head-to-head comparison panel */}
        <ComparePanel
          listingType={listingType}
          neighbourhoods={(nbhds?.neighbourhoods ?? []).map((n) => ({ slug: n.slug, name: n.name }))}
        />

        {!neighbourhood && (
          <div className="text-center py-12 text-slate-400">
            <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-base">Select a neighbourhood above — or click a bar in the chart — to see detailed stats.</p>
          </div>
        )}

        {neighbourhood && (
          <>
            {/* Neighbourhood header with link to full page */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 capitalize">{neighbourhood.replace(/-/g, " ")}</h2>
              <a
                href={`/neighbourhood/${neighbourhood}`}
                className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
              >
                Full neighbourhood page →
              </a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {statsLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              ) : (
                <>
                  <StatCard
                    icon={Home}
                    label="Median Price"
                    value={formatKsh(stats?.medianPriceKsh)}
                    sub={`Per ${listingType === "rent" ? "month" : "unit"}`}
                  />
                  <StatCard
                    icon={BarChart2}
                    label="Active Listings"
                    value={stats?.activeListings?.toString() ?? "—"}
                    sub={`Last ${days} days`}
                  />
                  <StatCard
                    icon={Clock}
                    label="Avg Days on Market"
                    value={
                      stats?.medianDaysOnMarket != null
                        ? `${Math.round(stats.medianDaysOnMarket)} days`
                        : "—"
                    }
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="Price per sqft"
                    value={
                      stats?.medianPricePerSqftKsh != null
                        ? `KSh ${Math.round(stats.medianPricePerSqftKsh).toLocaleString()}`
                        : "—"
                    }
                  />
                </>
              )}
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>
                  Price Trend — {listingType === "rent" ? "Rental" : "Sale"} Market (90 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-400">
                    No trend data available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="price"
                        orientation="left"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        tickFormatter={(v) => formatKsh(v)}
                        width={75}
                      />
                      <YAxis
                        yAxisId="listings"
                        orientation="right"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "Median Price" ? formatKsh(Number(value)) : value,
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="price"
                        name="Median Price"
                        stroke="#1a3a2a"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="listings"
                        type="monotone"
                        dataKey="listings"
                        name="Active Listings"
                        stroke="#86efac"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Price alert section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-primary" />
                  Price Alerts for {neighbourhood.charAt(0).toUpperCase() + neighbourhood.slice(1)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PriceAlertSection
                  neighbourhood={neighbourhood}
                  listingType={listingType}
                  userId={userId}
                  email={email}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
