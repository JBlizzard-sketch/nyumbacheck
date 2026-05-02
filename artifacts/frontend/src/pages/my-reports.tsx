import { useUser } from "@clerk/react";
import { useGetReport } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getReportsFromLocalStorage } from "@/lib/local-storage";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Clock, CheckCircle, XCircle, Loader2, FileText, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const statusConfig: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="h-3.5 w-3.5" />,
    class: "bg-amber-100 text-amber-800 border-amber-200",
  },
  processing: {
    label: "Processing",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    class: "bg-blue-100 text-blue-800 border-blue-200",
  },
  complete: {
    label: "Complete",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    class: "bg-green-100 text-green-800 border-green-200",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="h-3.5 w-3.5" />,
    class: "bg-red-100 text-red-800 border-red-200",
  },
  awaiting_payment: {
    label: "Awaiting Payment",
    icon: <Clock className="h-3.5 w-3.5" />,
    class: "bg-purple-100 text-purple-800 border-purple-200",
  },
};

const riskClass: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

type ApiReport = {
  id: number;
  inputUrl: string | null;
  inputAddress: string | null;
  email: string;
  status: string;
  createdAt: string;
  score: number | null;
  riskLevel: string | null;
};

// Row for reports fetched from the server (have score already)
function ApiReportRow({ report }: { report: ApiReport }) {
  const status = report.status;
  const config = statusConfig[status] ?? statusConfig.pending;
  const input = report.inputUrl || report.inputAddress || `Report #${report.id}`;

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="pt-4 pb-4 flex items-center gap-4">
        <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{input}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(report.createdAt).toLocaleDateString("en-KE", {
              year: "numeric", month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <Badge className={`flex items-center gap-1 text-xs border flex-shrink-0 ${config.class}`}>
          {config.icon}
          {config.label}
        </Badge>
        {report.riskLevel && report.score != null && (
          <Badge className={`text-xs border flex-shrink-0 capitalize ${riskClass[report.riskLevel] ?? ""}`}>
            {report.riskLevel} risk • {Math.round(report.score)}
          </Badge>
        )}
        <Link href={`/reports/${report.id}`}>
          <Button variant="ghost" size="sm" className="flex-shrink-0 gap-1">
            View <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// Row for localStorage-only reports (need to poll status)
function LocalReportRow({ id }: { id: number }) {
  const { data, isLoading } = useGetReport(id, {
    query: {
      refetchInterval: (query) => {
        const status = (query.state.data as { status?: string })?.status;
        return status === "pending" || status === "processing" ? 5000 : false;
      },
    },
  });

  const status = data?.status ?? "pending";
  const config = statusConfig[status] ?? statusConfig.pending;
  const input = data?.inputUrl || data?.inputAddress || `Report #${id}`;

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="pt-4 pb-4 flex items-center gap-4">
        <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4 mb-1" />
          ) : (
            <p className="text-sm font-medium text-slate-900 truncate">{input}</p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {data?.createdAt
              ? new Date(data.createdAt).toLocaleDateString("en-KE", {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })
              : "—"}
          </p>
        </div>
        <Badge className={`flex items-center gap-1 text-xs border flex-shrink-0 ${config.class}`}>
          {config.icon}
          {config.label}
        </Badge>
        {data?.fraudScore?.riskLevel && (
          <Badge className={`text-xs border flex-shrink-0 capitalize ${riskClass[data.fraudScore.riskLevel] ?? ""}`}>
            {data.fraudScore.riskLevel} risk • {Math.round(data.fraudScore.score)}
          </Badge>
        )}
        <Link href={`/reports/${id}`}>
          <Button variant="ghost" size="sm" className="flex-shrink-0 gap-1">
            View <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function MyReportsPage() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const userId = user?.id ?? "";

  // Fetch server-side reports (signed-in users who submitted with their Clerk ID)
  const { data: serverData, isLoading: serverLoading, refetch } = useQuery<{ reports: ApiReport[] }>({
    queryKey: ["my-reports-server", userId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/reports/mine?userId=${encodeURIComponent(userId)}`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<{ reports: ApiReport[] }>;
    },
    enabled: !!userId,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const serverReports = serverData?.reports ?? [];
  const serverIds = new Set(serverReports.map((r) => r.id));

  // Fall back to localStorage for reports not yet linked to account
  const localReports = getReportsFromLocalStorage(email).filter((r) => !serverIds.has(r.id));

  const totalCount = serverReports.length + localReports.length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">My Reports</h1>
            <p className="text-slate-600">
              Reports submitted with {email}.
              {serverReports.length > 0 && (
                <span className="text-primary font-medium"> {serverReports.length} synced to your account.</span>
              )}
            </p>
          </div>
          {userId && (
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 flex-shrink-0">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>

        {serverLoading && serverReports.length === 0 && (
          <div className="flex items-center gap-2 text-slate-400 mb-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your reports…</span>
          </div>
        )}

        {totalCount === 0 && !serverLoading ? (
          <div className="text-center py-24 text-slate-400">
            <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg mb-2">No reports yet</p>
            <p className="text-sm mb-6">Check a property to generate your first fraud report.</p>
            <Link href="/check">
              <Button>Check a Property</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Server-side reports first (most accurate, have score data) */}
            {serverReports.map((r) => (
              <ApiReportRow key={r.id} report={r} />
            ))}
            {/* Local-only reports (submitted before signing in / before userId tracking) */}
            {localReports.map((r) => (
              <LocalReportRow key={r.id} id={r.id} />
            ))}
          </div>
        )}

        {localReports.length > 0 && serverReports.length === 0 && (
          <p className="mt-4 text-xs text-slate-400 text-center">
            Future reports submitted while signed in will be automatically saved to your account.
          </p>
        )}
      </div>
    </Layout>
  );
}
