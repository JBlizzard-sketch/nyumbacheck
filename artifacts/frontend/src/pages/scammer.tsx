import { useState } from "react";
import { useLookupScammer } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, Phone, Loader2, ShieldAlert, Flag } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ReportState = "idle" | "submitting" | "success" | "error";

export default function ScammerPage() {
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState("");

  // report form state
  const [reportPhone, setReportPhone] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [showReportForm, setShowReportForm] = useState(false);

  const { data, isLoading, isError } = useLookupScammer(
    { phone: submitted },
    { query: { enabled: !!submitted, retry: 1 } },
  );

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
                      Confirmed fraud case
                    </p>
                  )}
                  {data.notes && (
                    <div className="p-3 bg-red-100 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800">{data.notes}</p>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-red-100 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-900">
                      Do not send money to this number.
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      Always verify a landlord or agent in person before paying any deposit.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-green-700">
                  This number has not been reported in our database. Exercise standard caution — our
                  registry covers only confirmed fraud cases.
                </p>
              )}
            </CardContent>
          </Card>
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
