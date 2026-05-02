import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck, ShieldAlert, ShieldX, Phone, Building2,
  TrendingDown, AlertTriangle, CheckCircle, Loader2, ArrowLeft, ExternalLink, Copy,
  FileText, Clock, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { usePageMeta } from "@/lib/use-page-meta";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Agent = {
  id: number;
  name: string;
  company: string | null;
  reputationScore: number;
  totalListings: number;
  ghostListingRate: number;
  priceConsistencyScore: number;
  duplicateListingRate: number;
  isVerified: boolean;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  phoneNumbers: string[];
};

// ── Agent Reports Section ─────────────────────────────────────────────────────
type AgentReport = {
  id: number;
  inputUrl: string | null;
  inputAddress: string | null;
  createdAt: string;
  score: number | null;
  riskLevel: string | null;
  neighbourhood: string | null;
  listingType: string | null;
};

type AgentReportsData = {
  reports: AgentReport[];
  total: number;
  highRiskCount: number;
  avgScore: number | null;
};

const AGENT_RISK: Record<string, { dot: string; badge: string; text: string; bar: string }> = {
  critical: { dot: "bg-red-500",    badge: "bg-red-100 text-red-800 border-red-200",       text: "text-red-700",    bar: "#ef4444" },
  high:     { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800 border-orange-200", text: "text-orange-700", bar: "#f97316" },
  medium:   { dot: "bg-amber-400",  badge: "bg-amber-100 text-amber-800 border-amber-200",   text: "text-amber-700",  bar: "#f59e0b" },
  low:      { dot: "bg-green-500",  badge: "bg-green-100 text-green-800 border-green-200",   text: "text-green-700",  bar: "#22c55e" },
};

function timeAgoAgent(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function AgentReportsSection({ agentId }: { agentId: number }) {
  const { data, isLoading } = useQuery<AgentReportsData>({
    queryKey: ["agent-reports", agentId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/agents/${agentId}/reports`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<AgentReportsData>;
    },
    staleTime: 60_000,
    retry: false,
  });

  if (!isLoading && (!data || data.total === 0)) return null;

  const reports = data?.reports ?? [];

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Fraud Reports Checked Against This Agent
          </CardTitle>
          {data && data.total > 0 && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span><strong className="text-slate-800">{data.total}</strong> total</span>
              {data.highRiskCount > 0 && (
                <span className="text-orange-600 font-semibold">{data.highRiskCount} high/critical</span>
              )}
              {data.avgScore != null && (
                <span>avg <strong className="text-slate-800">{data.avgScore}/100</strong></span>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          Anonymised fraud checks on listings associated with this agent.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const meta = AGENT_RISK[r.riskLevel ?? "low"] ?? AGENT_RISK.low;
              const label = r.inputUrl ? new URL(r.inputUrl).hostname.replace("www.", "") : (r.inputAddress ?? `Report #${r.id}`);
              return (
                <Link key={r.id} href={`/reports/${r.id}`}>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 transition-all cursor-pointer group">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                    <Badge className={`text-xs border capitalize flex-shrink-0 ${meta.badge}`}>
                      {r.riskLevel ?? "—"} risk
                    </Badge>
                    <span className="text-xs font-mono text-slate-700 flex-shrink-0 w-12">
                      {r.score != null ? `${Math.round(r.score)}/100` : "—"}
                    </span>
                    <span className="text-xs text-slate-500 truncate flex-1">{label}</span>
                    {r.neighbourhood && (
                      <span className="text-xs text-slate-400 capitalize flex-shrink-0 hidden sm:block">{r.neighbourhood}</span>
                    )}
                    <span className="text-xs text-slate-400 flex-shrink-0 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {timeAgoAgent(r.createdAt)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0 group-hover:text-primary transition-colors" />
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

function ReputationArc({ score, isBlacklisted }: { score: number; isBlacklisted: boolean }) {
  const r = 52;
  const circ = Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = isBlacklisted ? "#ef4444" : score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="132" height="78" viewBox="0 0 132 78">
        <path d={`M 10 72 A ${r} ${r} 0 0 1 122 72`} fill="none" stroke="#e2e8f0" strokeWidth="10" strokeLinecap="round" />
        <path
          d={`M 10 72 A ${r} ${r} 0 0 1 122 72`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="66" y="68" textAnchor="middle" fontSize="28" fontWeight="700" fill="#1a2a22">
          {Math.round(score)}
        </text>
      </svg>
      <p className="text-xs text-slate-400">Reputation Score / 100</p>
    </div>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-800">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const agentId = parseInt(id ?? "", 10);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (isNaN(agentId)) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    fetch(`${BASE}/api/agents/${agentId}`)
      .then(r => r.ok ? r.json() as Promise<Agent> : Promise.reject(r.status))
      .then(data => { setAgent(data); setLoading(false); })
      .catch(code => { setNotFound(code === 404); setLoading(false); });
  }, [agentId]);

  usePageMeta(
    agent
      ? {
          title: agent.name,
          description: `${agent.name}${agent.company ? ` · ${agent.company}` : ""} — Reputation score: ${Math.round(agent.reputationScore)}/100, ${agent.totalListings} listings, ${Math.round(agent.ghostListingRate * 100)}% ghost rate.${agent.isBlacklisted ? " ⚠ Blacklisted agent." : agent.isVerified ? " ✓ Verified agent." : ""} NyumbaCheck Agent Directory.`,
          ogType: "article",
        }
      : null
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      </Layout>
    );
  }

  if (notFound || !agent) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
          <ShieldAlert className="h-14 w-14 text-slate-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-700 mb-2">Agent Not Found</h1>
          <p className="text-slate-500 mb-6">This agent profile doesn't exist or has been removed.</p>
          <Link href="/scammer"><Button variant="outline">Back to Scammer Lookup</Button></Link>
        </div>
      </Layout>
    );
  }

  const repColor = agent.isBlacklisted ? "#ef4444" : agent.reputationScore >= 75 ? "#22c55e" : agent.reputationScore >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <Link href="/agents">
          <button className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Agent Directory
          </button>
        </Link>

        {/* Header card */}
        <Card className={`mb-6 overflow-hidden ${agent.isBlacklisted ? "border-red-300" : agent.isVerified ? "border-green-300" : ""}`}>
          {agent.isBlacklisted && (
            <div className="bg-red-600 text-white text-xs font-bold uppercase tracking-widest py-2 text-center">
              ⚠ Blacklisted Agent — Do Not Engage
            </div>
          )}
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0">
                <div
                  className="h-20 w-20 rounded-full flex items-center justify-center text-3xl font-bold text-white"
                  style={{ backgroundColor: repColor }}
                >
                  {agent.name.charAt(0).toUpperCase()}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start mb-1">
                  <h1 className="text-2xl font-bold text-slate-900">{agent.name}</h1>
                  {agent.isVerified && (
                    <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </Badge>
                  )}
                  {agent.isBlacklisted && (
                    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
                      <ShieldX className="h-3 w-3" /> Blacklisted
                    </Badge>
                  )}
                  {!agent.isVerified && !agent.isBlacklisted && (
                    <Badge variant="outline" className="text-slate-500">Unverified</Badge>
                  )}
                </div>

                {agent.company && (
                  <p className="flex items-center gap-1.5 text-slate-600 text-sm justify-center sm:justify-start mb-3">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    {agent.company}
                  </p>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-slate-600 justify-center sm:justify-start">
                  <span><strong className="text-slate-900">{agent.totalListings}</strong> total listings</span>
                  <span><strong className="text-slate-900">{Math.round(agent.ghostListingRate * 100)}%</strong> ghost listing rate</span>
                  <span><strong className="text-slate-900">{Math.round(agent.duplicateListingRate * 100)}%</strong> duplicate rate</span>
                </div>

                {/* Phone numbers */}
                {agent.phoneNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                    {agent.phoneNumbers.map((p) => (
                      <button
                        key={p}
                        onClick={() => { navigator.clipboard.writeText(p).then(() => toast.success("Copied")); }}
                        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full text-xs font-mono text-slate-700 transition-colors"
                      >
                        <Phone className="h-3 w-3" />
                        {p}
                        <Copy className="h-3 w-3 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Score arc */}
              <div className="flex-shrink-0">
                <ReputationArc score={agent.reputationScore} isBlacklisted={agent.isBlacklisted} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Stats card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary" /> Listing Health Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <StatBar
                label="Price Consistency"
                value={agent.priceConsistencyScore}
                color={agent.priceConsistencyScore >= 0.7 ? "#22c55e" : agent.priceConsistencyScore >= 0.5 ? "#f59e0b" : "#ef4444"}
              />
              <StatBar
                label="Ghost Listing Rate (lower is better)"
                value={agent.ghostListingRate}
                color={agent.ghostListingRate <= 0.1 ? "#22c55e" : agent.ghostListingRate <= 0.3 ? "#f59e0b" : "#ef4444"}
              />
              <StatBar
                label="Duplicate Listing Rate (lower is better)"
                value={agent.duplicateListingRate}
                color={agent.duplicateListingRate <= 0.1 ? "#22c55e" : agent.duplicateListingRate <= 0.3 ? "#f59e0b" : "#ef4444"}
              />

              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { label: "Total Listings", value: agent.totalListings },
                  { label: "Reputation Score", value: `${Math.round(agent.reputationScore)}/100` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risk / status card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {agent.isBlacklisted
                  ? <><ShieldX className="h-4 w-4 text-red-500" /> Fraud Warning</>
                  : agent.isVerified
                  ? <><ShieldCheck className="h-4 w-4 text-green-600" /> Verification Status</>
                  : <><ShieldAlert className="h-4 w-4 text-amber-500" /> Agent Status</>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {agent.isBlacklisted ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-900 text-sm mb-1">Blacklisted Agent</p>
                      {agent.blacklistReason && (
                        <p className="text-sm text-red-700">{agent.blacklistReason}</p>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm font-semibold text-red-900">Do not pay any money to this agent.</p>
                    <p className="text-xs text-red-700 mt-1">Report any contact to the Directorate of Criminal Investigations.</p>
                  </div>
                  <Link href="/scammer">
                    <Button variant="outline" className="w-full gap-2 border-red-200 text-red-700 hover:bg-red-50">
                      <ExternalLink className="h-4 w-4" /> Check Another Number
                    </Button>
                  </Link>
                </div>
              ) : agent.isVerified ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-green-900 text-sm mb-1">Verified Agent</p>
                      <p className="text-sm text-green-700">
                        This agent's identity and credentials have been verified by NyumbaCheck.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Verified status means we have confirmed this agent's licence, company registration, and listing accuracy.
                    Still exercise standard caution and never pay a deposit without a signed agreement.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm mb-1">Unverified Agent</p>
                      <p className="text-sm text-amber-700">
                        This agent has not been independently verified. Exercise caution.
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Always verify a landlord or agent in person before paying any deposit.
                    Request proof of ownership (title deed) or an agency licence.
                  </p>
                  <Link href="/check">
                    <Button className="w-full gap-2">
                      Run Fraud Report on a Listing
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fraud reports section */}
        <AgentReportsSection agentId={agent.id} />

        {/* Bottom CTA */}
        <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-slate-900 text-sm">Seen a listing from this agent?</p>
            <p className="text-xs text-slate-500 mt-0.5">Run a full fraud analysis on any listing URL or address for KSh 500.</p>
          </div>
          <Link href="/check">
            <Button className="gap-2 flex-shrink-0">Check a Property Listing</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
