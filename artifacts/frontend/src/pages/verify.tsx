import { useState } from "react";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, CheckCircle, Clock, ArrowRight, Star, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "Trust Badge",
    desc: "A verified green badge displayed on your listing and NyumbaCheck reports, instantly signalling trustworthiness.",
  },
  {
    icon: Star,
    title: "Priority ranking",
    desc: "Verified listings are ranked higher in NyumbaCheck search results and market intelligence tools.",
  },
  {
    icon: CheckCircle,
    title: "Fraud protection",
    desc: "We flag impersonators who copy your listing photos or phone number — protecting both you and your tenants.",
  },
  {
    icon: Clock,
    title: "2-day turnaround",
    desc: "Our verification team reviews ID, title deed or agency licence, and property ownership documents within 2 business days.",
  },
];

const STEPS = [
  { num: "1", label: "Submit your listing URL + contact details below" },
  { num: "2", label: "Our team contacts you to collect ownership documents" },
  { num: "3", label: "We verify documents and activate your Trust Badge" },
  { num: "4", label: "Renters see your verified status on every NyumbaCheck report" },
];

export default function VerifyPage() {
  const { user } = useUser();

  const [form, setForm] = useState({
    listingUrl: "",
    landlordName: user?.fullName ?? "",
    landlordPhone: "",
    landlordEmail: user?.primaryEmailAddress?.emailAddress ?? "",
    propertyAddress: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ referenceId: string; message: string } | null>(null);
  const [error, setError] = useState("");

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.listingUrl || !form.landlordName || !form.landlordPhone || !form.landlordEmail || !form.propertyAddress) {
      setError("Please fill in all required fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, userId: user?.id }),
      });
      const data = await r.json() as { status?: string; message?: string; referenceId?: string; error?: string };
      if (!r.ok || data.error) {
        throw new Error(data.message ?? "Submission failed");
      }
      setSubmitted({ referenceId: data.referenceId ?? "", message: data.message ?? "" });
      toast.success("Verification request submitted!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-lg text-center">
          <div className="bg-green-100 rounded-full p-4 w-16 h-16 mx-auto mb-6 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Request received!</h1>
          <p className="text-slate-600 mb-4 leading-relaxed">{submitted.message}</p>
          <div className="inline-flex items-center gap-2 bg-slate-100 rounded-lg px-4 py-2 mb-8">
            <span className="text-xs text-slate-500">Reference ID</span>
            <span className="font-mono text-sm font-bold text-slate-800">{submitted.referenceId}</span>
          </div>
          <div className="space-y-2 text-sm text-slate-500">
            <p>Save your reference ID above. Our team will contact you at <strong>{form.landlordEmail}</strong>.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Hero */}
        <div className="text-center mb-12">
          <Badge className="bg-primary/10 text-primary border-primary/20 mb-4 text-sm px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5 inline" />
            NyumbaCheck Trust Badge
          </Badge>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Verified landlords get more<br />serious enquiries.
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Stand out from scammers. Get a verified Trust Badge on your listings — so renters know you're the real deal before they call.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <Card key={b.title} className="hover:border-primary/30 transition-colors">
                <CardContent className="pt-5 pb-5 flex items-start gap-4">
                  <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{b.title}</p>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{b.desc}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* How it works */}
        <Card className="mb-10 bg-primary/5 border-primary/15">
          <CardHeader>
            <CardTitle className="text-base text-primary">How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {STEPS.map((s) => (
                <li key={s.num} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                    {s.num}
                  </span>
                  {s.label}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Submit verification request</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Free for individual landlords. Agency plans available.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Listing URL <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="https://buyrentkenya.com/listing/..."
                    value={form.listingUrl}
                    onChange={set("listingUrl")}
                    type="url"
                  />
                  <p className="text-xs text-slate-400 mt-1">BuyRentKenya, Jiji, Jumia House, etc.</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Property address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Apartment 4B, Westlands, Nairobi"
                    value={form.propertyAddress}
                    onChange={set("propertyAddress")}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Your name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="Full name"
                    value={form.landlordName}
                    onChange={set("landlordName")}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Phone number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="+254 7XX XXX XXX"
                    value={form.landlordPhone}
                    onChange={set("landlordPhone")}
                    type="tel"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Email address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="you@example.com"
                    value={form.landlordEmail}
                    onChange={set("landlordEmail")}
                    type="email"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Additional notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Textarea
                  placeholder="e.g. I am the property owner. Title deed available. Happy to provide photos of original documents."
                  value={form.notes}
                  onChange={set("notes")}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" /> Submit Verification Request <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>

              <p className="text-xs text-slate-400 text-center">
                By submitting you agree to provide truthful information. NyumbaCheck reserves the right to remove badges at any time.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
