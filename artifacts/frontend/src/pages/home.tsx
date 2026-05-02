import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert, Search, LineChart, ArrowRight, Copy, Phone,
  ImageOff, MapPin, Clock, BarChart3, ShieldCheck, Users,
  AlertTriangle, TrendingUp, CheckCircle, ExternalLink
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AdminStats = {
  reports: { total: number; complete: number };
  scammerRegistry: { total: number; confirmed: number };
  listings: { total: number };
  fraudScores: { critical: number; avgScore: number };
};

type CompareRow = {
  slug: string;
  name: string;
  medianPriceKsh: number | null;
  activeListings: number;
  avgFraudScore: number | null;
};

function useStats() {
  return useQuery<AdminStats>({
    queryKey: ["home-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/stats`);
      if (!r.ok) throw new Error("stats unavailable");
      return r.json() as Promise<AdminStats>;
    },
    staleTime: 60_000,
    retry: false,
  });
}

function useNeighbourhoodRisk() {
  return useQuery<{ neighbourhoods: CompareRow[] }>({
    queryKey: ["home-compare"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/market/compare?listingType=rent`);
      if (!r.ok) throw new Error("compare unavailable");
      return r.json() as Promise<{ neighbourhoods: CompareRow[] }>;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-6 py-4">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-sm text-primary-foreground/70 mt-0.5">{label}</p>
    </div>
  );
}

function fraudRiskMeta(score: number | null) {
  if (score == null) return { label: "Unknown", bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-200", bar: "bg-slate-300", width: "w-0" };
  if (score >= 60) return { label: "High Risk", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", bar: "bg-red-500", width: `w-[${Math.round(score)}%]` };
  if (score >= 35) return { label: "Medium Risk", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "bg-amber-400", width: `w-[${Math.round(score)}%]` };
  return { label: "Low Risk", bg: "bg-green-50", text: "text-green-700", border: "border-green-200", bar: "bg-green-500", width: `w-[${Math.round(score)}%]` };
}

function formatKsh(v: number | null) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `KSh ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `KSh ${Math.round(v / 1_000)}K`;
  return `KSh ${v.toLocaleString()}`;
}

const SIGNALS = [
  {
    icon: Copy,
    title: "Cross-platform duplicate detection",
    desc: "We scrape 5+ Nairobi property portals and fingerprint every listing. If the same property appears with different prices or agents, that's a major red flag.",
  },
  {
    icon: BarChart3,
    title: "Price vs neighbourhood median",
    desc: "Ghost listings lure victims with prices 20–40% below market rate. We benchmark every listing against 90 days of real transaction data.",
  },
  {
    icon: Clock,
    title: "Days on market anomaly",
    desc: "Listings that stay active for months without a tenancy are typically ghost posts. We flag anything significantly above the neighbourhood average.",
  },
  {
    icon: Phone,
    title: "Agent phone fingerprint",
    desc: "We track every agent contact number across platforms. Numbers linked to prior fraud complaints are immediately flagged.",
  },
  {
    icon: ImageOff,
    title: "Image reuse detection",
    desc: "Fraudsters reuse the same photos across multiple fake listings in different locations. Our perceptual hash engine catches even edited copies.",
  },
  {
    icon: MapPin,
    title: "Address consistency check",
    desc: "We normalise Nairobi addresses (streets, estates, post codes) and detect listings where the address doesn't match the stated neighbourhood.",
  },
];

// Static sample report for the preview section
const SAMPLE_SIGNALS = [
  { label: "Duplicate listing detected", desc: "Same photos + address found on Jiji at KSh 28K — KSh 12K cheaper.", contribution: 28 },
  { label: "Price 38% below median", desc: "Westlands median rent is KSh 69K. This listing at KSh 43K is a major anomaly.", contribution: 24 },
  { label: "Agent phone flagged", desc: "+254 7XX XXX is linked to 3 prior fraud complaints in the scammer registry.", contribution: 18 },
];

function SampleReportPreview() {
  const score = 71;
  const r = 52;
  const cx = 64, cy = 64;
  const startAngle = -220;
  const endAngle = 40;
  const totalArc = endAngle - startAngle;
  const fillAngle = startAngle + (score / 100) * totalArc;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  });
  const startPt = arc(startAngle);
  const endPtFill = arc(fillAngle);
  const endPtTrack = arc(endAngle);
  const largeArcTrack = endAngle - startAngle > 180 ? 1 : 0;
  const largeArcFill = fillAngle - startAngle > 180 ? 1 : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden max-w-lg w-full">
      {/* Header bar */}
      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3 flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-xs text-slate-400 font-mono truncate">nyumbacheck.com/reports/1284</span>
      </div>
      <div className="p-5">
        {/* Report title */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Fraud Analysis Report #1284</p>
            <p className="text-sm font-medium text-slate-700 truncate">3-bed apartment, Westlands, Nairobi</p>
          </div>
          <Badge className="bg-orange-100 text-orange-800 border-orange-200 border text-xs flex-shrink-0">HIGH RISK</Badge>
        </div>

        {/* Score gauge + signals */}
        <div className="flex items-start gap-5">
          <div className="flex-shrink-0 flex flex-col items-center">
            <svg width={128} height={88} viewBox="0 0 128 88">
              <path
                d={`M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArcTrack} 1 ${endPtTrack.x} ${endPtTrack.y}`}
                fill="none" stroke="#e2e8f0" strokeWidth={10} strokeLinecap="round"
              />
              <path
                d={`M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArcFill} 1 ${endPtFill.x} ${endPtFill.y}`}
                fill="none" stroke="#f97316" strokeWidth={10} strokeLinecap="round"
              />
              <text x={cx} y={cy + 6} textAnchor="middle" className="text-2xl font-bold" fontSize={22} fontWeight={700} fill="#0f172a">{score}</text>
              <text x={cx} y={cy + 20} textAnchor="middle" fontSize={9} fill="#94a3b8">/100</text>
            </svg>
            <span className="text-xs text-slate-400">Fraud Risk Score</span>
          </div>
          <div className="flex-1 space-y-2 mt-1">
            {SAMPLE_SIGNALS.map((s, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 leading-tight">{s.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">Full report with 6 signals · PDF download · WhatsApp share</p>
          <span className="text-xs font-semibold text-primary">KSh 500</span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data: stats } = useStats();
  const { data: compareData } = useNeighbourhoodRisk();

  const reportsAnalyzed = stats?.reports.complete ?? 0;
  const scammersTracked = stats?.scammerRegistry.total ?? 0;
  const listingsIndexed = stats?.listings.total ?? 0;
  const criticalCases = stats?.fraudScores.critical ?? 0;

  const neighbourhoods = (compareData?.neighbourhoods ?? [])
    .filter((n) => n.avgFraudScore != null)
    .sort((a, b) => (b.avgFraudScore ?? 0) - (a.avgFraudScore ?? 0));

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-24 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-white/90 text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-white/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Nairobi's only AI-powered property fraud detector
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Don't get scammed<br className="hidden md:block" /> on your next home.
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            NyumbaCheck detects ghost listings, duplicate properties, and fraudulent agents before you pay a deposit — across BuyRentKenya, Jiji, Jumia House and more.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/check">
              <Button size="lg" className="w-full sm:w-auto bg-white text-primary hover:bg-slate-100 text-lg h-14 px-8 font-semibold">
                Check a Property <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/market">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/30 hover:bg-white/10 text-white text-lg h-14 px-8">
                View Market Intel
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Live stats bar */}
      <section className="bg-primary/90 border-t border-white/10 px-4">
        <div className="container mx-auto max-w-5xl flex flex-wrap justify-center divide-x divide-white/20">
          <StatBadge value={reportsAnalyzed.toLocaleString()} label="Reports analyzed" />
          <StatBadge value={scammersTracked.toLocaleString()} label="Scammers tracked" />
          <StatBadge value={listingsIndexed.toLocaleString()} label="Listings indexed" />
          <StatBadge value={criticalCases.toLocaleString()} label="Critical fraud cases" />
        </div>
      </section>

      {/* Neighbourhood Fraud Heatmap */}
      {neighbourhoods.length > 0 && (
        <section className="py-16 bg-white px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Nairobi Fraud Risk by Neighbourhood</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Sorted by average fraud score across active listings. Click any neighbourhood for full market data.
                </p>
              </div>
              <Link href="/market">
                <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1 flex-shrink-0">
                  <TrendingUp className="h-4 w-4" /> Full market intel →
                </button>
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {neighbourhoods.map((nbhd) => {
                const risk = fraudRiskMeta(nbhd.avgFraudScore);
                const score = nbhd.avgFraudScore ?? 0;
                return (
                  <Link key={nbhd.slug} href={`/neighbourhood/${nbhd.slug}`}>
                    <div className={`rounded-xl border p-3.5 cursor-pointer hover:shadow-sm transition-all group ${risk.bg} ${risk.border}`}>
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <p className="font-semibold text-slate-900 text-sm leading-tight group-hover:text-primary transition-colors">
                          {nbhd.name}
                        </p>
                        <span className={`text-xs font-bold flex-shrink-0 ${risk.text}`}>{Math.round(score)}</span>
                      </div>
                      {/* Fraud score bar */}
                      <div className="h-1.5 bg-white/60 rounded-full mb-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${risk.bar}`}
                          style={{ width: `${Math.min(score, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${risk.text}`}>{risk.label}</span>
                        <span className="text-xs text-slate-400">{formatKsh(nbhd.medianPriceKsh)}/mo</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 mt-4 text-center">
              Score = average fraud risk across all tracked listings in this area · Updated daily
            </p>
          </div>
        </section>
      )}

      {/* Sample Report Preview */}
      <section className="py-20 bg-slate-50 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                <ExternalLink className="h-3.5 w-3.5" /> What you get for KSh 500
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                A full fraud report — before you visit.
              </h2>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Every report includes a 0–100 fraud risk score built from 6 independently-weighted signals. You'll see exactly why a listing was flagged — in plain English — before you call the agent or travel to view.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  "Duplicate listing detection across 5+ platforms",
                  "Price anomaly vs. 90-day neighbourhood median",
                  "Agent phone cross-referenced against scammer registry",
                  "Image reuse fingerprinting (pHash engine)",
                  "PDF download · WhatsApp share link",
                  "Email delivery within 5 minutes",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
              <Link href="/check">
                <Button className="gap-2">
                  Check a Property <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="flex justify-center md:justify-end">
              <SampleReportPreview />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">We analyse thousands of data points across multiple platforms to give you confidence before you visit or pay a deposit.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Search,
                step: "1. Submit a Listing",
                desc: "Paste the URL from any major Kenyan property site — BuyRentKenya, Jiji, Jumia House, HassConsult — or enter the address directly.",
              },
              {
                icon: ShieldAlert,
                step: "2. We Analyse",
                desc: "Our pipeline checks for stolen images, unrealistic prices, blacklisted agents, and cross-platform duplicates. Results in under 5 minutes.",
              },
              {
                icon: LineChart,
                step: "3. Get the Report",
                desc: "Receive a 0–100 fraud risk score with a full explanation of every signal. Share the report URL with family before making any payment.",
              },
            ].map(({ icon: Icon, step, desc }) => (
              <div key={step} className="bg-slate-50 p-8 rounded-2xl border border-slate-100 text-center">
                <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{step}</h3>
                <p className="text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fraud signals */}
      <section className="py-20 bg-slate-50 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">6 Signals. One Score.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Every report is built from six independently-weighted fraud signals. Each signal is explained in plain language so you know exactly why a listing is flagged.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {SIGNALS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-6 rounded-2xl border border-slate-100 bg-white hover:border-primary/20 hover:bg-slate-50/50 transition-colors">
                <div className="bg-primary/10 p-2.5 rounded-xl flex-shrink-0 h-fit">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="py-10 bg-primary/5 border-y border-primary/10 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { icon: ShieldCheck, label: "Verified Agent Directory" },
              { icon: MapPin, label: "12 Nairobi Neighbourhoods" },
              { icon: Phone, label: "Scammer Registry" },
              { icon: Users, label: "M-Pesa + Card Payments" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 py-3">
                <Icon className="h-5 w-5 text-primary opacity-70" />
                <p className="text-xs font-medium text-slate-600">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="py-16 bg-primary text-primary-foreground px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Protect yourself before you pay a deposit.
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
            A KSh 500 fraud check could save you KSh 30,000–200,000 in lost deposits. Check any listing in under 5 minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/check">
              <Button size="lg" className="bg-white text-primary hover:bg-slate-100 h-13 px-10 text-base font-semibold">
                Check a Property Now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/scammer">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 h-13 px-8">
                Scammer Lookup
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
