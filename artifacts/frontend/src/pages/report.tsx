import { useEffect, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useGetReport } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Clock, XCircle, ExternalLink, CreditCard, Lock, Loader2, Search, FileCheck, Copy, MessageCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { generateReportPdf } from "@/lib/report-pdf";

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

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

  if (isError || !data) {
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
  }[(data as { status: string }).status] ?? <Clock className="h-5 w-5 text-slate-400" />;

  const input = (data as { inputUrl?: string; inputAddress?: string }).inputUrl
    || (data as { inputUrl?: string; inputAddress?: string }).inputAddress
    || "—";
  const reportData = data as {
    id: number;
    status: string;
    email?: string;
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
  };

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
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fraud Signals</h3>
                    {reportData.fraudScore.signals.map((signal, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{signal.label}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{signal.description}</p>
                        </div>
                        <span className="ml-auto text-xs font-mono text-slate-500">
                          {Math.round((signal.contribution ?? signal.score ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Duplicate listings */}
        {reportData.duplicateListings && reportData.duplicateListings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Duplicate Listings Found ({reportData.duplicateListings.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-2 pr-4 font-medium">Platform</th>
                      <th className="pb-2 pr-4 font-medium">Price (KSh)</th>
                      <th className="pb-2 pr-4 font-medium">Agent Phone</th>
                      <th className="pb-2 font-medium">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.duplicateListings.map((dup, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 font-medium capitalize">{dup.platform}</td>
                        <td className="py-2 pr-4 text-slate-600">
                          {dup.priceKsh != null ? dup.priceKsh.toLocaleString() : "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{dup.agentPhone ?? "—"}</td>
                        <td className="py-2">
                          <a
                            href={dup.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reportData.platformCount != null && (
                <p className="mt-4 text-sm text-slate-600">
                  Found across <strong>{reportData.platformCount} platforms</strong>.
                  {reportData.priceRangeKsh &&
                    ` Price range: KSh ${reportData.priceRangeKsh.min.toLocaleString()} – KSh ${reportData.priceRangeKsh.max.toLocaleString()}.`}
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
