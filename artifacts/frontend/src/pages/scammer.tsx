import { useState, useEffect } from "react";
import { useLookupScammer } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, Phone, Loader2, ShieldAlert, Flag, User, ArrowRight, Users, TrendingUp, Copy } from "lucide-react";
import { Link, useSearch } from "wouter";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ReportState = "idle" | "submitting" | "success" | "error";

// ── Trending Scammers Leaderboard ─────────────────────────────────────────────
type TrendingEntry = {
  id: number;
  normalisedPhone: string;
  reportCount: number;
  linkedListingCount: number | null;
  isConfirmed: boolean;
  notes: string | null;
  updatedAt: string;
};

function TrendingScammers({ onSearch }: { onSearch: (phone: string) => void }) {
  const { data, isLoading } = useQuery<{ entries: TrendingEntry[] }>({
    queryKey: ["scammer-trending"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/scammer-registry/trending`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json() as Promise<{ entries: TrendingEntry[] }>;
    },
    staleTime: 60_000,
  });

  const entries = data?.entries ?? [];
  if (!isLoading && entries.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-red-500" />
          Most Reported Numbers
          {!isLoading && entries.length > 0 && (
            <Badge className="ml-auto bg-red-100 text-red-800 border-red-200 text-xs">
              {entries.length} entries
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                {/* Rank */}
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0
                      ? "bg-red-600 text-white"
                      : idx === 1
                      ? "bg-red-400 text-white"
                      : idx === 2
                      ? "bg-orange-400 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {idx + 1}
                </span>

                {/* Phone + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-slate-800 font-medium">
                      {entry.normalisedPhone}
                    </span>
                    {entry.isConfirmed && (
                      <Badge className="text-xs bg-red-100 text-red-800 border-red-200 h-5 px-1.5">
                        Confirmed
                      </Badge>
                    )}
                    {(entry.linkedListingCount ?? 0) > 0 && (
                      <Badge variant="outline" className="text-xs h-5 px-1.5 text-slate-500">
                        {entry.linkedListingCount} listing{(entry.linkedListingCount ?? 0) !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{entry.notes}</p>
                  )}
                </div>

                {/* Report count pill */}
                <span className="flex-shrink-0 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  {entry.reportCount}× reported
                </span>

                {/* Actions */}
                <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    title="Copy number"
                    onClick={() => {
                      navigator.clipboard.writeText(entry.normalisedPhone).then(() =>
                        toast.success("Number copied"),
                      );
                    }}
                    className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Look up"
                    onClick={() => onSearch(entry.normalisedPhone)}
                    className="p-1.5 rounded hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3 text-center">
          Ordered by number of community reports · Click → to look up
        </p>
      </CardContent>
    </Card>
  );
}

function useAgentByPhone(phone: string) {
  return useQuery<{ found: boolean; agentId: number | null }>({
    queryKey: ["agent-by-phone", phone],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/agents/by-phone/${encodeURIComponent(phone)}`);
      if (!r.ok) throw new Error("lookup failed");
      return r.json() as Promise<{ found: boolean; agentId: number | null }>;
    },
    enabled: !!phone,
    staleTime: 60_000,
  });
}

export default function ScammerPage() {
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState("");

  // Auto-submit if ?phone= URL param is present on mount
  const search = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const phoneParam = params.get("phone");
    if (phoneParam) {
      const cleaned = phoneParam.trim();
      setPhone(cleaned);
      setSubmitted(cleaned);
    }
  }, []); // intentionally run once on mount only

  const handleSearchFromLeaderboard = (normalisedPhone: string) => {
    setPhone(normalisedPhone);
    setSubmitted(normalisedPhone);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // report form state
  const [reportPhone, setReportPhone] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [showReportForm, setShowReportForm] = useState(false);

  const { data, isLoading, isError } = useLookupScammer(
    { phone: submitted },
    { query: { enabled: !!submitted, retry: 1 } },
  );
  const { data: agentLookup } = useAgentByPhone(submitted);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.trim();
    if (cleaned) setSubmitted(cleaned);
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = reportPhone.trim();
    if (!cleaned) return;
    setReportState("submitting");
    try {
      const res = await fetch(`${BASE}/api/scammer-registry/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned, notes: reportNotes.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      setReportState("success");
      setReportPhone("");
      setReportNotes("");
    } catch {
      setReportState("error");
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <ShieldAlert className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Scammer Phone Registry</h1>
          <p className="text-slate-600">
            Check if a phone number has been reported in connection with property fraud in Nairobi.
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-10 h-12"
                  placeholder="e.g. 0712 345 678 or +254712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <Button type="submit" className="h-12 px-6" disabled={isLoading || !phone.trim()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-red-700 text-sm">Failed to look up this number. Please try again.</p>
            </CardContent>
          </Card>
        )}

        {data && !isLoading && (
          <Card
            className={
              data.isRegistered
                ? "border-red-300 bg-red-50"
                : "border-green-300 bg-green-50"
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {data.isRegistered ? (
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                ) : (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                )}
                <span className={data.isRegistered ? "text-red-800" : "text-green-800"}>
                  {data.isRegistered ? "Number in Scammer Registry" : "Number Not Found in Registry"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-500" />
                <span className="font-mono text-sm text-slate-700">{data.normalisedPhone || submitted}</span>
              </div>

              {data.isRegistered ? (
                <>
                  {data.reportCount != null && (
                    <p className="text-sm text-red-700">
                      This number has been reported{" "}
                      <strong>{data.reportCount} time{data.reportCount !== 1 ? "s" : ""}</strong> for
                      property fraud.
                    </p>
                  )}
                  {data.linkedListingCount != null && data.linkedListingCount > 0 && (
                    <p className="text-sm text-red-700">
                      Linked to <strong>{data.linkedListingCount} fraudulent listing{data.linkedListingCount !== 1 ? "s" : ""}</strong> across multiple platforms.
                    </p>
                  )}
                  {data.isConfirmed && (
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                      ✓ Confirmed fraud case
                    </p>
                  )}
                  {data.notes && (
                    <div className="p-3 bg-red-100 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800">{data.notes}</p>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-red-100 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-900">Do not send money to this number.</p>
                    <p className="text-xs text-red-700 mt-1">Always verify a landlord or agent in person before paying any deposit.</p>
                  </div>
                  {agentLookup?.found && agentLookup.agentId != null && (
                    <Link href={`/agent/${agentLookup.agentId}`}>
                      <button className="flex items-center gap-2 w-full mt-1 p-3 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                        <User className="h-4 w-4" />
                        View Full Agent Profile
                        <ArrowRight className="h-4 w-4 ml-auto" />
                      </button>
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-green-700">
                    This number has not been reported in our database. Exercise standard caution — our
                    registry covers only confirmed fraud cases.
                  </p>
                  {agentLookup?.found && agentLookup.agentId != null && (
                    <Link href={`/agent/${agentLookup.agentId}`}>
                      <button className="flex items-center gap-2 w-full mt-2 p-3 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                        <User className="h-4 w-4" />
                        View Agent Profile in Directory
                        <ArrowRight className="h-4 w-4 ml-auto" />
                      </button>
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Trending leaderboard — hidden while showing a result */}
        {!submitted && (
          <TrendingScammers onSearch={handleSearchFromLeaderboard} />
        )}

        <div className="mt-8 p-4 bg-slate-100 rounded-xl text-sm text-slate-600">
          <p className="font-semibold mb-1">About this registry</p>
          <p>
            Our scammer registry is built from reports submitted by Nairobi renters and buyers, cross-referenced
            with duplicate listing data across multiple platforms. Numbers are confirmed by our fraud
            analysis pipeline before being added.
          </p>
        </div>

        {/* Report a number */}
        <div className="mt-6">
          <button
            onClick={() => { setShowReportForm((v) => !v); setReportState("idle"); }}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Flag className="h-4 w-4" />
            {showReportForm ? "Hide report form" : "Report a number to this registry"}
          </button>

          {showReportForm && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className="h-4 w-4 text-red-500" />
                  Report a Scammer Number
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reportState === "success" ? (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800 text-sm">Report received — thank you!</p>
                      <p className="text-xs text-green-700 mt-0.5">The number has been added to the review queue.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleReport} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          className="pl-10"
                          placeholder="e.g. 0712 345 678 or +254712345678"
                          value={reportPhone}
                          onChange={(e) => setReportPhone(e.target.value)}
                          required
                          minLength={7}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Notes <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <Textarea
                        placeholder="Describe the fraud attempt — e.g. 'Posted same 2BR Kilimani listing on 3 platforms, asked for KSh 30,000 deposit via M-Pesa before viewing'"
                        value={reportNotes}
                        onChange={(e) => setReportNotes(e.target.value)}
                        rows={3}
                        maxLength={500}
                        className="resize-none"
                      />
                      <p className="text-xs text-slate-400 mt-1">{reportNotes.length}/500</p>
                    </div>
                    {reportState === "error" && (
                      <p className="text-sm text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Failed to submit. Please try again.
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={reportState === "submitting" || !reportPhone.trim()}
                      className="w-full gap-2"
                    >
                      {reportState === "submitting"
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                        : <><Flag className="h-4 w-4" /> Submit Report</>}
                    </Button>
                    <p className="text-xs text-slate-400 text-center">
                      Reports are reviewed before the number is publicly confirmed as fraud.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
