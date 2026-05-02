import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useSubmitReport } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck, Loader2, CreditCard, Smartphone, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { addReportToLocalStorage } from "@/lib/local-storage";
import { useUser } from "@clerk/react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── M-Pesa waiting screen ─────────────────────────────────────────────────────

function MpesaWaitingScreen({
  phone,
  reportId,
  checkoutRequestId,
  onCancel,
}: {
  phone: string;
  reportId: number;
  checkoutRequestId: string;
  onCancel: () => void;
}) {
  const [, setLocation] = useLocation();
  const [elapsed, setElapsed] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const TIMEOUT_S = 120;
  const remaining = Math.max(0, TIMEOUT_S - elapsed);
  const pct = Math.min(100, (elapsed / TIMEOUT_S) * 100);

  useEffect(() => {
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  // Poll the report status every 3s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/api/reports/${reportId}`);
        const data = (await r.json()) as { status?: string };
        if (data.status && data.status !== "awaiting_payment") {
          setConfirmed(true);
          clearInterval(pollRef.current!);
          setTimeout(() => setLocation(`/reports/${reportId}`), 1500);
        }
      } catch (_) {}
    }, 3_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [reportId, setLocation]);

  // Timeout
  useEffect(() => {
    if (elapsed >= TIMEOUT_S && !confirmed) {
      setFailed(true);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [elapsed, confirmed]);

  if (confirmed) {
    return (
      <div className="text-center py-10 space-y-4">
        <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Payment confirmed!</h2>
        <p className="text-slate-600">Taking you to your report…</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="text-center py-10 space-y-4">
        <div className="bg-red-100 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Payment not confirmed</h2>
        <p className="text-slate-600 text-sm">
          We didn't receive a payment confirmation. If you completed the payment, please contact support with your phone number and the time of payment.
        </p>
        <Button variant="outline" onClick={onCancel} className="mt-2">Try again</Button>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-6">
      {/* Animated phone icon */}
      <div className="relative mx-auto w-20 h-20">
        <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-40" />
        <div className="relative bg-green-100 rounded-full p-4 w-20 h-20 flex items-center justify-center">
          <Smartphone className="h-10 w-10 text-green-600" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-900">Check your phone</h2>
        <p className="text-slate-600 text-sm mt-1 max-w-xs mx-auto">
          A payment request of <strong>KSh 500</strong> has been sent to <strong>{phone}</strong>.<br />
          Enter your M-Pesa PIN to confirm.
        </p>
      </div>

      {/* Progress ring */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="#22c55e"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (pct / 100)}`}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-800">
            {remaining}s
          </span>
        </div>
        <p className="text-xs text-slate-400">Waiting for confirmation…</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-slate-400">
          Didn't get the push? Check your M-Pesa balance or try again.
        </p>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-slate-500 text-xs">
          Cancel & try a different method
        </Button>
      </div>
    </div>
  );
}

// ── Main Check Page ───────────────────────────────────────────────────────────

export default function CheckPage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const submitReport = useSubmitReport();

  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress || "");
  const [url, setUrl] = useState("");
  const [address, setAddress] = useState("");
  const [inputMode, setInputMode] = useState<"url" | "address">("url");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "mpesa">("card");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaWaiting, setMpesaWaiting] = useState<{
    phone: string;
    reportId: number;
    checkoutRequestId: string;
  } | null>(null);
  const [initiating, setInitiating] = useState(false);

  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress && !email) {
      setEmail(user.primaryEmailAddress.emailAddress);
    }
  }, [user, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Email is required"); return; }
    if (inputMode === "url" && !url) { toast.error("Listing URL is required"); return; }
    if (inputMode === "address" && !address) { toast.error("Address is required"); return; }
    if (paymentMethod === "mpesa") {
      if (!mpesaPhone) { toast.error("M-Pesa phone number is required"); return; }
      const phoneOk = /^(?:254|\+254|0)?[17]\d{8}$/.test(mpesaPhone.replace(/\s/g, ""));
      if (!phoneOk) { toast.error("Enter a valid Kenyan phone number (e.g. 0712 345678)"); return; }
    }

    const payload = {
      email,
      ...(inputMode === "url" ? { inputUrl: url } : { inputAddress: address }),
      ...(user?.id ? { userId: user.id } : {}),
    };

    submitReport.mutate(
      { data: payload },
      {
        onSuccess: async (data) => {
          const reportId = (data as { id: number }).id;
          const checkoutUrl = (data as { checkoutUrl?: string | null }).checkoutUrl;
          addReportToLocalStorage(email, reportId);

          if (paymentMethod === "mpesa") {
            // Use M-Pesa STK push regardless of Stripe mode
            const cleanPhone = mpesaPhone.replace(/\s/g, "");
            setInitiating(true);
            try {
              const r = await fetch(`${BASE}/api/payments/mpesa/initiate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: cleanPhone, amount: 500, reportRequestId: reportId }),
              });

              if (!r.ok) {
                // Report might already be in pending (free mode fallback) — just navigate
                toast.success("Property submitted for analysis!");
                setLocation(`/reports/${reportId}`);
                return;
              }

              const mpesaData = (await r.json()) as { checkoutRequestId?: string };
              setMpesaWaiting({
                phone: cleanPhone.startsWith("254") ? `+${cleanPhone}` : cleanPhone,
                reportId,
                checkoutRequestId: mpesaData.checkoutRequestId ?? `SIM-${Date.now()}`,
              });
            } catch {
              toast.error("Failed to initiate M-Pesa payment. Please try card instead.");
            } finally {
              setInitiating(false);
            }
            return;
          }

          if (checkoutUrl) {
            toast.success("Redirecting to secure payment…");
            window.location.href = checkoutUrl;
          } else {
            toast.success("Property submitted for analysis!");
            setLocation(`/reports/${reportId}`);
          }
        },
        onError: (err) => {
          toast.error((err as Error).message || "Failed to submit report");
        },
      },
    );
  };

  const isPending = submitReport.isPending || initiating;

  if (mpesaWaiting) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-lg">
          <Card>
            <CardContent className="pt-6">
              <MpesaWaitingScreen
                phone={mpesaWaiting.phone}
                reportId={mpesaWaiting.reportId}
                checkoutRequestId={mpesaWaiting.checkoutRequestId}
                onCancel={() => setMpesaWaiting(null)}
              />
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Check a Property</h1>
          <p className="text-slate-600">
            Enter a listing URL or address to generate a comprehensive fraud risk report.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Property Details</CardTitle>
            <CardDescription>We'll analyse the listing and deliver a full risk report to your email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Your Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Input type tabs */}
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "url" | "address")}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="url">Listing URL</TabsTrigger>
                  <TabsTrigger value="address">Manual Address</TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="space-y-2">
                  <Label htmlFor="url">Listing URL</Label>
                  <Input
                    id="url"
                    placeholder="https://www.buyrentkenya.com/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">Supports BuyRentKenya, Jiji, Jumia House, PropertySearch, and more.</p>
                </TabsContent>
                <TabsContent value="address" className="space-y-2">
                  <Label htmlFor="address">Property Address</Label>
                  <Input
                    id="address"
                    placeholder="e.g. 3 Bedroom Apartment in Kilimani"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </TabsContent>
              </Tabs>

              {/* What you get */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700">What you get for KSh 500 (≈ $4)</p>
                <ul className="text-sm text-slate-600 space-y-1">
                  {[
                    "Fraud risk score (0–100) with explainable signals",
                    "Cross-platform duplicate listing detection",
                    "Agent phone scammer registry check",
                    "Price vs. neighbourhood median analysis",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Payment method selector */}
              <div className="space-y-3">
                <Label>Payment Method</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all text-left ${
                      paymentMethod === "card"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <CreditCard className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Card</div>
                      <div className="text-xs opacity-70">Visa / Mastercard</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("mpesa")}
                    className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all text-left ${
                      paymentMethod === "mpesa"
                        ? "border-[#00A651] bg-[#00A651]/5 text-[#00A651]"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Smartphone className="h-5 w-5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">M-Pesa</div>
                      <div className="text-xs opacity-70">Lipa Na M-Pesa</div>
                    </div>
                  </button>
                </div>

                {/* M-Pesa phone input */}
                {paymentMethod === "mpesa" && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Label htmlFor="mpesa-phone">M-Pesa Phone Number</Label>
                    <Input
                      id="mpesa-phone"
                      type="tel"
                      placeholder="e.g. 0712 345 678"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      className="text-base"
                    />
                    <p className="text-xs text-slate-500">
                      You'll receive an STK push on this number. Enter your PIN to confirm KSh 500.
                    </p>
                  </div>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className={`w-full h-12 text-base font-semibold ${
                  paymentMethod === "mpesa"
                    ? "bg-[#00A651] hover:bg-[#007A3D] text-white border-0"
                    : ""
                }`}
                disabled={isPending}
              >
                {isPending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {paymentMethod === "mpesa" ? "Sending M-Pesa push…" : "Preparing report…"}</>
                ) : paymentMethod === "mpesa" ? (
                  <><Smartphone className="mr-2 h-5 w-5" /> Pay KSh 500 via M-Pesa</>
                ) : (
                  <><Lock className="mr-2 h-4 w-4" /> Pay KSh 500 via Card</>
                )}
              </Button>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" /> Stripe secured
                </span>
                <span className="flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5 text-[#00A651]" /> M-Pesa STK Push
                </span>
                <span className="flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> 256-bit encrypted
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
