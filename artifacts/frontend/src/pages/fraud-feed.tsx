import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageMeta } from "@/lib/use-page-meta";
import {
  Shield, AlertTriangle, CheckCircle, Clock, ArrowRight,
  Filter, TrendingUp, Loader2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type FeedEntry = {
  id: number;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  score: number | null;
  signalCount: number;
  createdAt: string;
};

const RISK_META = {
  critical: { label: "Critical", bg: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500", text: "text-red-600", icon: "🔴" },
  high:     { label: "High",     bg: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500", text: "text-orange-600", icon: "🟠" },
  medium:   { label: "Medium",   bg: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-400", text: "text-amber-600", icon: "🟡" },
  low:      { label: "Low",      bg: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500", text: "text-green-600", icon: "🟢" },
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function ScoreMini({ score, riskLevel }: { score: number | null; riskLevel: string | null }) {
  const r = 18;
  const cx = 22, cy = 22;
  const startAngle = -220, endAngle = 40;
  const total = endAngle - startAngle;
  const fill = startAngle + ((score ?? 0) / 100) * total;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (a: number) => ({ x: cx + r * Math.cos(toRad(a)), y: cy + r * Math.sin(toRad(a)) });
  const s = arc(startAngle), e = arc(fill), et = arc(endAngle);
  const lft = endAngle - startAngle > 180 ? 1 : 0;
  const lff = fill - startAngle > 180 ? 1 : 0;
  const strokeColor = riskLevel === "critical" ? "#ef4444" : riskLevel === "high" ? "#f97316" : riskLevel === "medium" ? "#f59e0b" : "#22c55e";
  return (
    <svg width={44} height={36} viewBox="0 0 44 36">
      <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${lft} 1 ${et.x} ${et.y}`} fill="none" stroke="#e2e8f0" strokeWidth={4} strokeLinecap="round" />
      <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${lff} 1 ${e.x} ${e.y}`} fill="none" stroke={strokeColor} strokeWidth={4} strokeLinecap="round" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#0f172a">{score != null ? Math.round(score) : "—"}</text>
    </svg>
  );
}

function FeedCard({ entry }: { entry: FeedEntry }) {
  const meta = RISK_META[entry.riskLevel ?? "low"] ?? RISK_META.low;
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-4 hover:border-slate-200 hover:shadow-sm transition-all group">
      <ScoreMini score={entry.score} riskLevel={entry.riskLevel} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge className={`text-xs border px-2 py-0.5 ${meta.bg}`}>{meta.icon} {meta.label} Risk</Badge>
          <span className="text-xs text-slate-400">{timeAgo(entry.createdAt)}</span>
        </div>
        <p className="text-sm text-slate-600">
          Score <span className={`font-semibold ${meta.text}`}>{entry.score != null ? Math.round(entry.score) : "—"}/100</span>
          {" · "}
          {entry.signalCount} fraud signal{entry.signalCount !== 1 ? "s" : ""} fired
        </p>
      </div>
      <Link href="/check">
        <div className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
          Check yours <ArrowRight className="h-3 w-3" />
        </div>
      </Link>
    </div>
  );
}

const FILTERS = ["all", "critical", "high", "medium", "low"] as const;
type Filter = typeof FILTERS[number];

export default function FraudFeedPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  usePageMeta({
    title: "Recent Fraud Alerts — Nairobi",
    description: "Live feed of recent Nairobi property fraud checks. See what risk scores and fraud signals are being detected across Nairobi listings on NyumbaCheck.",
    ogType: "article",
  });

  const { data, isLoading } = useQuery<{ reports: FeedEntry[]; total: number }>({
    queryKey: ["fraud-feed", filter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filter !== "all") params.set("riskLevel", filter);
      const r = await fetch(`${BASE}/api/reports/recent-public?${params}`);
      if (!r.ok) throw new Error("feed unavailable");
      return r.json() as Promise<{ reports: FeedEntry[]; total: number }>;
    },
    staleTime: 30_000,
  });

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Stats
  const critCount = reports.filter((r) => r.riskLevel === "critical").length;
  const highCount = reports.filter((r) => r.riskLevel === "high").length;
  const avgScore = reports.length > 0
    ? Math.round(reports.reduce((a, r) => a + (r.score ?? 0), 0) / reports.length)
    : 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">Live Feed</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Recent Fraud Alerts — Nairobi</h1>
          <p className="text-slate-500">
            Anonymized results from recent property fraud checks across Nairobi. Every listing that users submit gets an AI fraud score — this is the live feed.
          </p>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Checks shown", value: isLoading ? "…" : String(total), icon: Shield, color: "text-primary" },
            { label: "Critical/High risk", value: isLoading ? "…" : String(critCount + highCount), icon: AlertTriangle, color: "text-red-500" },
            { label: "Avg fraud score", value: isLoading ? "…" : `${avgScore}/100`, icon: TrendingUp, color: "text-amber-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white border border-slate-100 rounded-xl p-4 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f === "all" ? "All checks" : `${RISK_META[f as keyof typeof RISK_META]?.icon} ${f}`}
            </button>
          ))}
        </div>

        {/* Feed */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No {filter !== "all" ? `${filter}-risk ` : ""}checks yet.</p>
            <Link href="/check"><Button className="mt-4 gap-2">Run the first check <ArrowRight className="h-4 w-4" /></Button></Link>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((entry) => <FeedCard key={entry.id} entry={entry} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              Previous
            </Button>
            <span className="text-sm text-slate-500">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Next
            </Button>
          </div>
        )}

        {/* CTA */}
        <div className="mt-8 p-5 bg-primary text-primary-foreground rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-base">Check your own listing</p>
            <p className="text-primary-foreground/80 text-sm mt-0.5">Paste any BuyRentKenya, Jiji, or Jumia House URL — results in under 5 minutes.</p>
          </div>
          <Link href="/check">
            <Button className="bg-white text-primary hover:bg-slate-100 flex-shrink-0 gap-2">
              Check a Property <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
