import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import {
  ShieldCheck, ShieldAlert, ShieldX, Phone, Building2,
  Search, Loader2, ArrowRight, Users
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AgentSummary = {
  id: number;
  name: string;
  company: string | null;
  reputationScore: number;
  totalListings: number;
  ghostListingRate: number;
  isVerified: boolean;
  isBlacklisted: boolean;
};

function MiniArc({ score, color }: { score: number; color: string }) {
  const r = 22;
  const circ = Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="56" height="34" viewBox="0 0 56 34">
      <path d={`M 4 30 A ${r} ${r} 0 0 1 52 30`} fill="none" stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" />
      <path d={`M 4 30 A ${r} ${r} 0 0 1 52 30`} fill="none" stroke={color} strokeWidth="6"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      <text x="28" y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1a2a22">
        {Math.round(score)}
      </text>
    </svg>
  );
}

function AgentCard({ agent }: { agent: AgentSummary }) {
  const repColor = agent.isBlacklisted
    ? "#ef4444"
    : agent.reputationScore >= 75 ? "#22c55e"
    : agent.reputationScore >= 50 ? "#f59e0b"
    : "#ef4444";

  return (
    <Card className={`hover:shadow-sm hover:border-primary/30 transition-all group ${agent.isBlacklisted ? "border-red-200" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="h-11 w-11 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
            style={{ backgroundColor: repColor }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 truncate">{agent.name}</p>
              {agent.isVerified && (
                <ShieldCheck className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              )}
              {agent.isBlacklisted && (
                <ShieldX className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              )}
            </div>
            {agent.company && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                <Building2 className="h-3 w-3 flex-shrink-0" /> {agent.company}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2">
              {agent.isBlacklisted ? (
                <Badge className="text-xs bg-red-100 text-red-800 border-red-200 gap-1">
                  <ShieldX className="h-3 w-3" /> Blacklisted
                </Badge>
              ) : agent.isVerified ? (
                <Badge className="text-xs bg-green-100 text-green-800 border-green-200 gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-slate-500">Unverified</Badge>
              )}
              <span className="text-xs text-slate-400">{agent.totalListings} listings</span>
              <span className="text-xs text-slate-400">{Math.round(agent.ghostListingRate * 100)}% ghost rate</span>
            </div>
          </div>
          <div className="flex flex-col items-center flex-shrink-0">
            <MiniArc score={agent.reputationScore} color={repColor} />
          </div>
        </div>
        <Link href={`/agent/${agent.id}`}>
          <Button variant="ghost" size="sm" className="w-full mt-3 gap-1.5 text-xs h-8 group-hover:bg-primary/5">
            View Profile <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [showBlacklisted, setShowBlacklisted] = useState<"all" | "blacklisted" | "clean">("all");

  const { data, isLoading } = useQuery<{ agents: AgentSummary[]; total: number }>({
    queryKey: ["agents", submitted, showBlacklisted],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (submitted) params.set("q", submitted);
      if (showBlacklisted === "blacklisted") params.set("isBlacklisted", "true");
      if (showBlacklisted === "clean") params.set("isBlacklisted", "false");
      const r = await fetch(`${BASE}/api/agents?${params}`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<{ agents: AgentSummary[]; total: number }>;
    },
    staleTime: 30_000,
  });

  const agents = data?.agents ?? [];
  const blacklisted = agents.filter((a) => a.isBlacklisted);
  const verified = agents.filter((a) => a.isVerified && !a.isBlacklisted);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Agent Directory</h1>
          </div>
          <p className="text-slate-500">
            Nairobi real estate agents tracked by our fraud pipeline. Check reputation scores, ghost listing rates, and blacklist status.
          </p>
        </div>

        {/* Stats row */}
        {data && (
          <div className="grid grid-cols-3 gap-3 mb-7">
            {[
              { label: "Total Agents", value: data.total, icon: Users, color: "text-primary" },
              { label: "Verified", value: verified.length, icon: ShieldCheck, color: "text-green-600" },
              { label: "Blacklisted", value: blacklisted.length, icon: ShieldX, color: "text-red-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-4 flex items-center gap-2.5">
                  <Icon className={`h-5 w-5 flex-shrink-0 ${color}`} />
                  <div>
                    <p className="text-xl font-bold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Search + filter */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <form
            onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }}
            className="flex gap-2 flex-1 min-w-0"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="Search by name or company…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </form>
          <div className="flex gap-1.5">
            {(["all", "blacklisted", "clean"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setShowBlacklisted(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  showBlacklisted === f
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-primary/40"
                }`}
              >
                {f === "all" ? "All" : f === "blacklisted" ? "🚫 Blacklisted" : "✅ Clean"}
              </button>
            ))}
          </div>
        </div>

        {/* Blacklist banner */}
        {showBlacklisted !== "clean" && blacklisted.length > 0 && !submitted && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
            <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-800">
              <strong>{blacklisted.length} blacklisted agent{blacklisted.length !== 1 ? "s" : ""}</strong> in this directory.
              Do not engage with blacklisted agents or transfer any money.
            </p>
          </div>
        )}

        {/* Phone lookup hint */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-5">
          <Phone className="h-3.5 w-3.5" />
          <span>Have a phone number? Use the <Link href="/scammer" className="text-primary underline underline-offset-2">Scammer Lookup</Link> to find the agent.</span>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No agents found{submitted ? ` matching "${submitted}"` : ""}.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((a) => <AgentCard key={a.id} agent={a} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}
