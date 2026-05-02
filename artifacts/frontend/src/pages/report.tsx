import { useParams } from "wouter";
import { useGetReport } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, Clock, XCircle, ExternalLink } from "lucide-react";

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

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const reportId = parseInt(id ?? "", 10);

  const { data, isLoading, isError } = useGetReport(reportId, {
    query: {
      refetchInterval: (query) => {
        const status = (query.state.data as { status?: string })?.status;
        return status === "pending" || status === "processing" ? 3000 : false;
      },
      enabled: !isNaN(reportId),
    },
  });

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
    pending: <Clock className="h-5 w-5 text-amber-500" />,
    processing: <Clock className="h-5 w-5 text-blue-500 animate-spin" />,
    complete: <CheckCircle className="h-5 w-5 text-green-500" />,
    failed: <XCircle className="h-5 w-5 text-red-500" />,
  }[data.status] ?? <Clock className="h-5 w-5 text-slate-400" />;

  const input = data.inputUrl || data.inputAddress || "—";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {statusIcon}
            <span className="text-sm font-medium capitalize text-slate-600">{data.status}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Fraud Analysis Report #{data.id}</h1>
          <p className="text-slate-500 mt-1 text-sm truncate max-w-lg">{input}</p>
        </div>

        {(data.status === "pending" || data.status === "processing") && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <Clock className="h-6 w-6 text-blue-500 flex-shrink-0 animate-pulse" />
              <div>
                <p className="font-semibold text-blue-800">Analysis in progress</p>
                <p className="text-sm text-blue-600">We are scanning multiple platforms and running fraud checks. This takes 3–7 minutes.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {data.status === "failed" && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Analysis failed</p>
                <p className="text-sm text-red-600">{data.failureReason ?? "An unknown error occurred."}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {data.fraudScore && (
          <Card>
            <CardHeader>
              <CardTitle>Fraud Score</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <ScoreGauge score={data.fraudScore.score} riskLevel={data.fraudScore.riskLevel} />
                <Badge className={`mt-2 mx-auto block w-fit text-sm capitalize border ${riskColors[data.fraudScore.riskLevel] ?? ""}`}>
                  {data.fraudScore.riskLevel} risk
                </Badge>
              </div>
              <div className="flex-1">
                <p className="text-slate-700 mb-6 leading-relaxed">{data.fraudScore.summary}</p>
                {data.fraudScore.signals && data.fraudScore.signals.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fraud Signals</h3>
                    {data.fraudScore.signals.map((signal, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{signal.label}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{signal.description}</p>
                        </div>
                        <span className="ml-auto text-xs font-mono text-slate-500">{Math.round(signal.score)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {data.duplicateListings && data.duplicateListings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Duplicate Listings Found ({data.duplicateListings.length})</CardTitle>
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
                    {data.duplicateListings.map((dup, i) => (
                      <tr key={i} className="py-2">
                        <td className="py-2 pr-4 font-medium capitalize">{dup.platform}</td>
                        <td className="py-2 pr-4 text-slate-600">
                          {dup.priceKsh != null ? `${dup.priceKsh.toLocaleString()}` : "—"}
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
              {data.platformCount != null && (
                <p className="mt-4 text-sm text-slate-600">
                  Found across <strong>{data.platformCount} platforms</strong>.
                  {data.priceRangeKsh && ` Price range: KSh ${data.priceRangeKsh.min.toLocaleString()} – KSh ${data.priceRangeKsh.max.toLocaleString()}.`}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {data.status === "complete" && !data.fraudScore && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Analysis complete</p>
                <p className="text-sm text-green-700">No significant fraud signals detected. The full report has been sent to {data.email}.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
