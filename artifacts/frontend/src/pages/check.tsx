import { useState } from "react";
import { Layout } from "@/components/layout";
import { useSubmitReport } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck, Loader2, CreditCard, Smartphone, Lock } from "lucide-react";
import { addReportToLocalStorage } from "@/lib/local-storage";
import { useUser } from "@clerk/react";

export default function CheckPage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const submitReport = useSubmitReport();
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress || "");
  const [url, setUrl] = useState("");
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<"url" | "address">("url");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Email is required");
      return;
    }
    if (mode === "url" && !url) {
      toast.error("Listing URL is required");
      return;
    }
    if (mode === "address" && !address) {
      toast.error("Address is required");
      return;
    }

    const payload = {
      email,
      ...(mode === "url" ? { inputUrl: url } : { inputAddress: address }),
      ...(user?.id ? { userId: user.id } : {}),
    };

    submitReport.mutate(
      { data: payload },
      {
        onSuccess: (data) => {
          const reportId = (data as { id: number }).id;
          addReportToLocalStorage(email, reportId);

          const checkoutUrl = (data as { checkoutUrl?: string | null }).checkoutUrl;

          if (checkoutUrl) {
            // Stripe is active — redirect to payment
            toast.success("Redirecting to secure payment...");
            window.location.href = checkoutUrl;
          } else {
            // Free / demo mode — go straight to report
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
            <CardDescription>We'll analyse the property and send you a full risk report by email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
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

              <Tabs value={mode} onValueChange={(v) => setMode(v as "url" | "address")}>
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
                  <p className="text-xs text-slate-500">
                    Supports BuyRentKenya, Property24, Jumia House, Jiji, and more.
                  </p>
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

              {/* Pricing summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700">What you get for $4 (≈ KSh 500)</p>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
                    Fraud risk score (0–100) with explainable signals
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
                    Cross-platform duplicate listing detection
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
                    Agent phone scammer registry check
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
                    Price vs. neighbourhood median analysis
                  </li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={submitReport.isPending}
              >
                {submitReport.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing report...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" /> Pay & Generate Report — $4
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" /> Card
                </span>
                <span className="flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" /> M-Pesa (coming soon)
                </span>
                <span className="flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Secured by Stripe
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
