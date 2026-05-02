import { useEffect, useState, useRef } from "react";
import { useParams, useSearch, useLocation, Link } from "wouter";
import { useGetReport } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Clock, XCircle, ExternalLink, CreditCard, Lock, Loader2, Search, FileCheck, Copy, MessageCircle, Download, ShieldCheck, ShieldAlert, Phone, TrendingDown, HelpCircle, ChevronDown, ChevronUp, Flag } from "lucide-react";
import { toast } from "sonner";
import { generateReportPdf } from "@/lib/report-pdf";
import { usePageMeta } from "@/lib/use-page-meta";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

// ── Platform badge colours ────────────────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; bg: string; text: string }> = {
  buyrentkenya: { label: "BuyRentKenya", bg: "bg-blue-100", text: "text-blue-800" },
  jiji:         { label: "Jiji",          bg: "bg-orange-100", text: "text-orange-800" },
  jumia:        { label: "Jumia House",   bg: "bg-amber-100",  text: "text-amber-800" },
  propertysearch: { label: "PropertySearch", bg: "bg-purple-100", text: "text-purple-800" },
  housesgalore: { label: "HousesGalore", bg: "bg-teal-100",   text: "text-teal-800" },
};
function platformMeta(p: string) {
  const key = p.toLowerCase().replace(/[^a-z]/g, "");
  return PLATFORM_META[key] ?? { label: p, bg: "bg-slate-100", text: "text-slate-700" };
}

// ── What To Do Next config ────────────────────────────────────────────────────
const VERDICT: Record<string, { headline: string; color: string; steps: string[] }> = {
  critical: {
    headline: "Do NOT proceed with this listing",
    color: "border-red-300 bg-red-50",
    steps: [
      "Do not pay any deposit or reservation fee to this agent.",
      "Report the listing to the property portal (Jiji, BuyRentKenya, etc.).",
      "Add this agent's phone number to the NyumbaCheck Scammer Registry.",
      "Share this report with friends to warn others.",
      "If you have already paid, contact the Kenya Police Cybercrime Unit.",
    ],
  },
  high: {
    headline: "Proceed with extreme caution",
    color: "border-orange-300 bg-orange-50",
    steps: [
      "Do not pay any deposit before a verified in-person property visit.",
      "Demand to see the original title deed or lease agreement.",
      "Cross-check the agent's phone in the Scammer Registry below.",
      "Verify the landlord's identity and ownership documents.",
      "Use a licensed property lawyer to review any agreements.",
    ],
  },
  medium: {
    headline: "Some concerns detected — verify before committing",
    color: "border-amber-200 bg-amber-50",
    steps: [
      "Visit the property in person before paying anything.",
      "Ask the agent for identification and proof of mandate.",
      "Search the property address on other portals to cross-check the price.",
      "Confirm the monthly rent matches the listing across platforms.",
    ],
  },
  low: {
    headline: "Listing appears legitimate",
    color: "border-green-200 bg-green-50",
    steps: [
      "Standard due diligence still applies — visit the property in person.",
      "Request a signed tenancy agreement before any payment.",
      "Confirm bank account details directly with the agent before transfer.",
    ],
  },
};

// ── Signal card with contribution bar ────────────────────────────────────────
type Signal = { label: string; description: string; score?: number; contribution?: number };

function SignalCard({ signal, maxContrib }: { signal: Signal; maxContrib: number }) {
  const [expanded, setExpanded] = useState(false);
  const contrib = signal.contribution ?? signal.score ?? 0;
  const pct = maxContrib > 0 ? Math.round((contrib / maxContrib) * 100) : 0;
  const borderColor = contrib >= 20 ? "border-l-red-400" : contrib >= 10 ? "border-l-amber-400" : "border-l-green-400";
  const barColor   = contrib >= 20 ? "bg-red-400"    : contrib >= 10 ? "bg-amber-400"    : "bg-green-400";
  const textColor  = contrib >= 20 ? "text-red-700"  : contrib >= 10 ? "text-amber-700"  : "text-green-700";

  return (
    <div className={`border-l-4 ${borderColor} rounded-r-lg bg-slate-50 border border-l-4 border-slate-100 overflow-hidden`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${textColor}`} />
        <span className="flex-1 text-sm font-semibold text-slate-800">{signal.label}</span>
        <span className={`text-xs font-mono font-bold ${textColor} flex-shrink-0`}>+{Math.round(contrib)}</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
      </button>
      {/* Contribution bar */}
      <div className="h-1 bg-slate-200 mx-3">
        <div className={`h-1 ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {expanded && (
        <p className="text-xs text-slate-600 px-3 pt-2 pb-3 leading-relaxed">{signal.description}</p>
      )}
    </div>
  );
}

// ── Duplicate listing card ────────────────────────────────────────────────────
type DupListing = { platform: string; url: string; priceKsh?: number | null; agentPhone?: string | null };

function DuplicateCard({ dup, basePrice }: { dup: DupListing; basePrice: number | null }) {
  const pm = platformMeta(dup.platform);
  const delta = basePrice && dup.priceKsh ? dup.priceKsh - basePrice : null;
  const deltaPct = delta && basePrice ? Math.round((delta / basePrice) * 100) : null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pm.bg} ${pm.text}`}>{pm.label}</span>
          {dup.agentPhone && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Phone className="h-3 w-3" /> {dup.agentPhone}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-base font-bold text-slate-900">
            {dup.priceKsh != null ? `KSh ${dup.priceKsh.toLocaleString()}` : "Price N/A"}
          </span>
          {deltaPct !== null && deltaPct !== 0 && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${deltaPct < 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              {deltaPct > 0 ? "+" : ""}{deltaPct}% vs first listing
            </span>
          )}
        </div>
      </div>
      <a
        href={dup.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-1"
      >
        View <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

// ── What to do next section ───────────────────────────────────────────────────
function WhatToDoNext({ riskLevel }: { riskLevel: string }) {
  const v = VERDICT[riskLevel] ?? VERDICT.low;
  const Icon = riskLevel === "critical" || riskLevel === "high" ? ShieldAlert : ShieldCheck;
  return (
    <Card className={`border ${v.color}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-5 w-5 ${riskLevel === "critical" ? "text-red-600" : riskLevel === "high" ? "text-orange-600" : riskLevel === "medium" ? "text-amber-600" : "text-green-600"}`} />
          What to do next — {v.headline}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {v.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${riskLevel === "critical" ? "bg-red-200 text-red-800" : riskLevel === "high" ? "bg-orange-200 text-orange-800" : riskLevel === "medium" ? "bg-amber-200 text-amber-800" : "bg-green-200 text-green-800"}`}>
                {i + 1}
              </span>
              <span className="text-slate-700 leading-snug">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex gap-2 flex-wrap">
          <Link href="/scammer">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <Phone className="h-3 w-3" /> Scammer Registry
            </Button>
          </Link>
          <Link href="/check">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <HelpCircle className="h-3 w-3" /> Check another listing
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Report Agent Card ────────────────────────────────────────────────────────
const API_BASE_REPORT = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

type ReportAgentState = "idle" | "submitting" | "success" | "error";

function ReportAgentCard({
  phones,
  riskLevel,
}: {
  phones: string[];
  riskLevel: string;
}) {
  const [selectedPhone, setSelectedPhone] = useState(phones[0] ?? "");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<ReportAgentState>("idle");

  if (riskLevel !== "high" && riskLevel !== "critical") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phone = selectedPhone.trim();
    if (!phone) return;
    setState("submitting");
    try {
      const r = await fetch(`${API_BASE_REPORT}/scammer-registry/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, notes: notes.trim() || undefined }),
      });
      if (!r.ok) throw new Error("failed");
      setState("success");
    } catch {
      setState("error");
    }
  }

  const borderColor = riskLevel === "critical" ? "border-red-300 bg-red-50" : "border-orange-200 bg-orange-50";
  const iconColor  = riskLevel === "critical" ? "text-red-600"    : "text-orange-600";
  const titleColor = riskLevel === "critical" ? "text-red-900"    : "text-orange-900";
  const subColor   = riskLevel === "critical" ? "text-red-700"    : "text-orange-700";
  const chipBase   = "text-xs font-mono px-2.5 py-1 rounded-full border transition-colors cursor-pointer";
  const chipActive = riskLevel === "critical"
    ? "bg-red-200 border-red-400 text-red-900"
    : "bg-orange-200 border-orange-400 text-orange-900";
  const chipInactive = "bg-white border-slate-200 text-slate-600 hover:border-slate-300";

  return (
    <Card className={`border ${borderColor}`}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-base ${titleColor}`}>
          <Flag className={`h-4 w-4 ${iconColor}`} />
          Protect others — report this agent
        </CardTitle>
        <p className={`text-sm mt-0.5 ${subColor}`}>
          Submitting this number adds it to the NyumbaCheck Scammer Registry so future renters are warned automatically.
        </p>
      </CardHeader>
      <CardContent>
        {state === "success" ? (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800 text-sm">Report received — thank you!</p>
              <p className="text-xs text-green-700 mt-0.5">
                The number <span className="font-mono font-semibold">{selectedPhone}</span> has been
                added to the review queue. Our team will confirm it within 24 hours.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {phones.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Agent phones detected in this listing
                </p>
                <div className="flex flex-wrap gap-2">
                  {phones.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPhone(p)}
                      className={`${chipBase} ${selectedPhone === p ? chipActive : chipInactive}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Phone number to report <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="pl-9 h-10 text-sm"
                  placeholder="+254 7XX XXX XXX"
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                  required
                  minLength={7}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Notes <span className="text-slate-400 font-normal">(optional — helps our review team)</span>
              </label>
              <Textarea
                className="resize-none text-sm"
                rows={2}
                maxLength={500}
                placeholder='e.g. "Same photos posted on 3 platforms, asked for KSh 40K deposit before viewing"'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">{notes.length}/500</p>
            </div>

            {state === "error" && (
              <p className="text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Submission failed — please try again.
              </p>
            )}

            <Button
              type="submit"
              disabled={state === "submitting" || !selectedPhone.trim()}
              className={`gap-2 ${riskLevel === "critical" ? "bg-red-700 hover:bg-red-800" : "bg-orange-600 hover:bg-orange-700"} text-white border-0`}
            >
              {state === "submitting"
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                : <><Flag className="h-4 w-4" /> Submit Report</>}
            </Button>
            <p className="text-xs text-slate-500">
              Reports are reviewed before the number is publicly confirmed as fraud. Your identity is not shared.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

const riskGauge: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

function ScoreGauge({ score, riskLevel }: { score: number; riskLevel: string }) {
  const radius = 70;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = riskGauge[riskLevel] ?? "#94a3b8";

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="100" viewBox="0 0 180 100">
        <path
          d={`M 10 90 A ${radius} ${radius} 0 0 1 170 90`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d={`M 10 90 A ${radius} ${radius} 0 0 1 170 90`}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="90" y="82" textAnchor="middle" fontSize="32" fontWeight="700" fill="#1a2a22">
          {Math.round(score)}
        </text>
        <text x="90" y="97" textAnchor="middle" fontSize="11" fill="#66776c">
          out of 100
        </text>
      </svg>
    </div>
  );
}

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const reportId = parseInt(id ?? "", 10);

  const params = new URLSearchParams(search);
  const paymentStatus = params.get("payment"); // "success" | "cancelled" | null

  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Scammer phone auto-flag: lookup each agentPhone in duplicate listings
  type ScammerMatch = { phone: string; reportCount: number | null; isConfirmed: boolean | null; notes: string | null };
  const [scammerMatches, setScammerMatches] = useState<ScammerMatch[]>([]);
  const scammerCheckedRef = useRef(false);

  const { data, isLoading, isError, refetch } = useGetReport(reportId, {
    query: {
      refetchInterval: (query) => {
        const status = (query.state.data as { status?: string } | undefined)?.status;
        return status === "pending" || status === "processing" || status === "awaiting_payment"
          ? 3000
          : false;
      },
      enabled: !isNaN(reportId),
    },
  });

  // On payment=success: call the confirm endpoint to unlock the report
  useEffect(() => {
    if (paymentStatus !== "success" || confirmed || confirming || isNaN(reportId)) return;

    setConfirming(true);

    // Get the stripe session id from the report data if available, otherwise
    // rely on the webhook which may have already run
    const doConfirm = async () => {
      try {
        // Try to find the session via the report — the webhook may have already set status=pending
        // If data is already paid/pending, skip the confirm call
        const currentStatus = (data as { status?: string } | undefined)?.status;
        if (currentStatus && currentStatus !== "awaiting_payment") {
          setConfirmed(true);
          setConfirming(false);
          return;
        }

        // The webhook should have handled it; if not, we try the session-based confirm.
        // We can't easily get the sessionId from the frontend without storing it.
        // The webhook + polling will handle the transition automatically.
        await refetch();
        setConfirmed(true);
        toast.success("Payment confirmed! Your report is being generated.");
      } catch {
        // Non-critical — report will update via polling
      } finally {
        setConfirming(false);
      }
    };

    doConfirm();
  }, [paymentStatus, confirmed, confirming, reportId, data, refetch]);

  // Run scammer lookup once after report completes
  useEffect(() => {
    if (scammerCheckedRef.current) return;
    const reportStatus = (data as { status?: string } | undefined)?.status;
    if (reportStatus !== "complete") return;
    const dups = (data as { duplicateListings?: Array<{ agentPhone?: string }> })?.duplicateListings ?? [];
    const phones = [...new Set(dups.map((d) => d.agentPhone).filter(Boolean) as string[])];
    if (phones.length === 0) return;
    scammerCheckedRef.current = true;

    Promise.all(
      phones.map(async (phone) => {
        try {
          const r = await fetch(`${API_BASE}/scammer-registry/lookup?phone=${encodeURIComponent(phone)}`);
          if (!r.ok) return null;
          const j = await r.json() as { isRegistered: boolean; reportCount: number | null; isConfirmed: boolean | null; notes: string | null };
          if (j.isRegistered) return { phone, reportCount: j.reportCount, isConfirmed: j.isConfirmed, notes: j.notes };
          return null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      const hits = results.filter(Boolean) as ScammerMatch[];
      if (hits.length > 0) setScammerMatches(hits);
    });
  }, [data]);

  // ── Derive display data before any early returns (hooks must run unconditionally) ──
  const reportData = data as {
    id: number;
    status: string;
    email?: string;
    createdAt?: string;
    inputUrl?: string;
    inputAddress?: string;
    failureReason?: string;
    platformCount?: number;
    priceRangeKsh?: { min: number; max: number };
    fraudScore?: {
      score: number;
      riskLevel: string;
      summary: string;
      signals?: Array<{ label: string; description: string; score?: number; contribution?: number }>;
    };
    duplicateListings?: Array<{ platform: string; url: string; priceKsh?: number; agentPhone?: string }>;
  } | undefined;

  const input = reportData?.inputUrl || reportData?.inputAddress || "—";

  // Hook must run before any conditional returns
  usePageMeta(
    reportData?.fraudScore
      ? {
          title: `Fraud Report #${reportData.id}`,
          description: `${input.slice(0, 80)} — NyumbaCheck fraud score: ${Math.round(reportData.fraudScore.score)}/100 (${reportData.fraudScore.riskLevel} risk). AI-powered property fraud analysis for Nairobi.`,
          ogType: "article",
        }
      : reportData
      ? { title: `Report #${reportData.id}` }
      : null
  );

  if (isNaN(reportId)) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <p className="text-slate-600">Invalid report ID.</p>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-4xl space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (isError || !data || !reportData) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Report Not Found</h1>
          <p className="text-slate-600">This report does not exist or has expired.</p>
        </div>
      </Layout>
    );
  }

  const statusIcon = {
    awaiting_payment: <CreditCard className="h-5 w-5 text-purple-500" />,
    pending: <Clock className="h-5 w-5 text-amber-500" />,
    processing: <Clock className="h-5 w-5 text-blue-500 animate-spin" />,
    complete: <CheckCircle className="h-5 w-5 text-green-500" />,
    failed: <XCircle className="h-5 w-5 text-red-500" />,
  }[(reportData as { status: string }).status] ?? <Clock className="h-5 w-5 text-slate-400" />;

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const riskEmoji = { low: "🟢", medium: "🟡", high: "🟠", critical: "🔴" }[reportData.fraudScore?.riskLevel ?? ""] ?? "🔍";
  const waText = reportData.fraudScore
    ? `NyumbaCheck fraud report for ${input.slice(0, 60)}: ${Math.round(reportData.fraudScore.score)}/100 risk score (${reportData.fraudScore.riskLevel.toUpperCase()}). ${riskEmoji} Check it: ${shareUrl}`
    : `NyumbaCheck analysis in progress for ${input.slice(0, 60)}. Check it: ${shareUrl}`;

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copied to clipboard")).catch(() => toast.error("Could not copy link"));
  }

  function handleWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener");
  }

  function handleDownloadPdf() {
    generateReportPdf({
      id: reportData.id,
      status: reportData.status,
      inputUrl: reportData.inputUrl,
      inputAddress: reportData.inputAddress,
      email: reportData.email,
      createdAt: reportData.createdAt,
      fraudScore: reportData.fraudScore
        ? {
            score: reportData.fraudScore.score,
            riskLevel: reportData.fraudScore.riskLevel,
            summary: reportData.fraudScore.summary,
            signals: reportData.fraudScore.signals as { label: string; description: string; contribution?: number }[],
          }
        : undefined,
      duplicateListings: reportData.duplicateListings as Array<{ platform: string; url: string; priceKsh?: number | null; agentPhone?: string | null }> | undefined,
      platformCount: (reportData as { platformCount?: number }).platformCount ?? null,
      priceRangeKsh: (reportData as { priceRangeKsh?: { min: number; max: number } }).priceRangeKsh ?? null,
    });
    toast.success("PDF downloaded");
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {statusIcon}
              <span className="text-sm font-medium capitalize text-slate-600">
                {reportData.status === "awaiting_payment" ? "Awaiting Payment" : reportData.status}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Fraud Analysis Report #{reportData.id}</h1>
            <p className="text-slate-500 mt-1 text-sm truncate max-w-lg">{input}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1 flex-wrap justify-end">
            {reportData.status === "complete" && reportData.fraudScore && (
              <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleDownloadPdf}>
                <Download className="h-3.5 w-3.5" /> Download PDF
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" /> Copy link
            </Button>
            <Button
              size="sm"
              className="gap-1.5 h-9 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
              onClick={handleWhatsApp}
            >
              <MessageCircle className="h-3.5 w-3.5" /> Share
            </Button>
          </div>
        </div>

        {/* Scammer phone warning */}
        {scammerMatches.length > 0 && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-5 pb-5 flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-red-800 text-base">
                  ⚠ Scammer phone number detected in this listing
                </p>
                {scammerMatches.map((m) => (
                  <div key={m.phone} className="mt-2">
                    <p className="text-sm font-semibold text-red-700">{m.phone}</p>
                    <p className="text-sm text-red-700">
                      Linked to {m.reportCount ?? "multiple"} fraud report{(m.reportCount ?? 2) !== 1 ? "s" : ""} in our registry.
                      {m.isConfirmed ? " Confirmed scammer." : ""}
                      {m.notes ? ` Note: ${m.notes}` : ""}
                    </p>
                  </div>
                ))}
                <div className="flex gap-3 mt-3 flex-wrap">
                  <Link href="/scammer">
                    <Button size="sm" variant="destructive" className="gap-1.5 h-8">
                      View in Scammer Registry
                    </Button>
                  </Link>
                  <p className="text-xs text-red-600 self-center">Do not pay any deposit to this agent.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment cancelled */}
        {paymentStatus === "cancelled" && reportData.status === "awaiting_payment" && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-800">Payment cancelled</p>
                <p className="text-sm text-amber-700 mt-1">
                  Your payment was not completed. Your report request is saved — you can pay to continue.
                </p>
                <Button
                  className="mt-3 h-9"
                  size="sm"
                  onClick={() => setLocation("/check")}
                >
                  <CreditCard className="mr-2 h-4 w-4" /> Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Awaiting payment (not yet returned from Stripe) */}
        {reportData.status === "awaiting_payment" && paymentStatus !== "success" && paymentStatus !== "cancelled" && (
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="h-6 w-6 text-purple-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-purple-800">Payment required to unlock report</p>
                <p className="text-sm text-purple-700 mt-1">
                  Complete your secure payment to start the fraud analysis.
                </p>
                <Button className="mt-3 h-9" size="sm" onClick={() => setLocation("/check")}>
                  <CreditCard className="mr-2 h-4 w-4" /> Pay $4 to unlock
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment success — confirming / waiting for webhook */}
        {paymentStatus === "success" && (reportData.status === "awaiting_payment" || confirming) && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <Clock className="h-6 w-6 text-green-500 flex-shrink-0 animate-pulse" />
              <div>
                <p className="font-semibold text-green-800">Payment received — starting analysis</p>
                <p className="text-sm text-green-700">Your report is being queued. This page will update automatically.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analysis in progress — progress stepper */}
        {(reportData.status === "pending" || reportData.status === "processing") && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-2 mb-5">
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
                <p className="font-semibold text-blue-800">Analysis in progress</p>
              </div>
              <ol className="relative ml-2 space-y-0">
                {([
                  {
                    label: "Report queued",
                    sub: "Payment verified, job added to pipeline",
                    done: true,
                    icon: CheckCircle,
                  },
                  {
                    label: "Cross-platform scan",
                    sub: "Checking BuyRentKenya, Jiji, Jumia House, PropertySearch…",
                    done: reportData.status === "processing",
                    active: reportData.status === "pending",
                    icon: Search,
                  },
                  {
                    label: "Fraud signal analysis",
                    sub: "Running price anomaly, image hash, agent phone checks",
                    done: false,
                    active: reportData.status === "processing",
                    icon: FileCheck,
                  },
                  {
                    label: "Report ready",
                    sub: "Results delivered on this page and by email",
                    done: false,
                    icon: CheckCircle,
                  },
                ] as Array<{ label: string; sub: string; done: boolean; active?: boolean; icon: React.ElementType }>).map(
                  (step, i, arr) => {
                    const Icon = step.icon;
                    return (
                      <li key={i} className="flex gap-3 pb-0">
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                              step.done
                                ? "bg-blue-600 border-blue-600 text-white"
                                : step.active
                                ? "bg-white border-blue-500 text-blue-500"
                                : "bg-white border-slate-200 text-slate-300"
                            }`}
                          >
                            {step.active ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Icon className="h-3.5 w-3.5" />
                            )}
                          </div>
                          {i < arr.length - 1 && (
                            <div
                              className={`w-0.5 h-8 mt-1 mb-1 ${
                                step.done ? "bg-blue-400" : "bg-slate-200"
                              }`}
                            />
                          )}
                        </div>
                        <div className="pt-0.5 pb-6">
                          <p
                            className={`text-sm font-semibold ${
                              step.done
                                ? "text-blue-800"
                                : step.active
                                ? "text-blue-700"
                                : "text-slate-400"
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className={`text-xs mt-0.5 ${step.done || step.active ? "text-blue-600" : "text-slate-400"}`}>
                            {step.sub}
                          </p>
                        </div>
                      </li>
                    );
                  },
                )}
              </ol>
              <p className="text-xs text-blue-600 mt-1 ml-1">This page refreshes automatically every 3 seconds.</p>
            </CardContent>
          </Card>
        )}

        {/* Failed */}
        {reportData.status === "failed" && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Analysis failed</p>
                <p className="text-sm text-red-600">{reportData.failureReason ?? "An unknown error occurred."}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fraud score */}
        {reportData.fraudScore && (
          <Card>
            <CardHeader>
              <CardTitle>Fraud Score</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <ScoreGauge score={reportData.fraudScore.score} riskLevel={reportData.fraudScore.riskLevel} />
                <Badge
                  className={`mt-2 mx-auto block w-fit text-sm capitalize border ${riskColors[reportData.fraudScore.riskLevel] ?? ""}`}
                >
                  {reportData.fraudScore.riskLevel} risk
                </Badge>
              </div>
              <div className="flex-1">
                <p className="text-slate-700 mb-6 leading-relaxed">{reportData.fraudScore.summary}</p>
                {reportData.fraudScore.signals && reportData.fraudScore.signals.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fraud Signals</h3>
                      <span className="text-xs text-slate-400">Click to expand each signal</span>
                    </div>
                    {[...reportData.fraudScore.signals]
                      .sort((a, b) => (b.contribution ?? b.score ?? 0) - (a.contribution ?? a.score ?? 0))
                      .map((signal, i) => {
                        const maxContrib = Math.max(...reportData.fraudScore!.signals!.map((s) => s.contribution ?? s.score ?? 0));
                        return <SignalCard key={i} signal={signal} maxContrib={maxContrib} />;
                      })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Duplicate listings */}
        {reportData.duplicateListings && reportData.duplicateListings.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-orange-500" />
                Duplicate Listings Found ({reportData.duplicateListings.length})
              </CardTitle>
              {reportData.platformCount != null && (
                <p className="text-sm text-slate-500 mt-1">
                  Same property detected across <strong>{reportData.platformCount} platform{reportData.platformCount !== 1 ? "s" : ""}</strong>
                  {reportData.priceRangeKsh && (
                    <> — price varies from <strong>KSh {reportData.priceRangeKsh.min.toLocaleString()}</strong> to <strong>KSh {reportData.priceRangeKsh.max.toLocaleString()}</strong></>
                  )}
                  . Price inconsistency is a key fraud signal.
                </p>
              )}
            </CardHeader>
            <CardContent>
              {/* Price spread bar */}
              {reportData.priceRangeKsh && reportData.duplicateListings.length > 1 && (() => {
                const { min, max } = reportData.priceRangeKsh;
                const spread = max - min;
                const spreadPct = min > 0 ? Math.round((spread / min) * 100) : 0;
                return (
                  <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>KSh {min.toLocaleString()} (lowest)</span>
                      <span>KSh {max.toLocaleString()} (highest)</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-2 bg-orange-400 rounded-full" style={{ width: "100%" }} />
                    </div>
                    <p className="text-xs text-orange-700 font-medium mt-1.5">
                      ⚠ {spreadPct}% price spread across platforms — agents listing the same property at different prices is a major red flag.
                    </p>
                  </div>
                );
              })()}
              <div className="space-y-2">
                {reportData.duplicateListings.map((dup, i) => (
                  <DuplicateCard
                    key={i}
                    dup={dup}
                    basePrice={reportData.duplicateListings![0]?.priceKsh ?? null}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* What to do next */}
        {reportData.fraudScore && (
          <WhatToDoNext riskLevel={reportData.fraudScore.riskLevel} />
        )}

        {/* Report agent inline card — only for high/critical */}
        {reportData.fraudScore && (reportData.fraudScore.riskLevel === "high" || reportData.fraudScore.riskLevel === "critical") && (() => {
          const phones = [
            ...new Set(
              (reportData.duplicateListings ?? [])
                .map((d) => d.agentPhone)
                .filter((p): p is string => !!p)
            ),
          ];
          return (
            <ReportAgentCard
              phones={phones}
              riskLevel={reportData.fraudScore!.riskLevel}
            />
          );
        })()}

        {/* Complete with no fraud score */}
        {reportData.status === "complete" && !reportData.fraudScore && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Analysis complete</p>
                <p className="text-sm text-green-700">
                  No significant fraud signals detected. The full report has been sent to {reportData.email}.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
