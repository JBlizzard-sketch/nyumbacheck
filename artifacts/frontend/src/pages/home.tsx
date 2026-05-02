import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert, Search, LineChart, ArrowRight, Copy, Phone,
  ImageOff, MapPin, Clock, BarChart3, ShieldCheck, Users
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AdminStats = {
  reports: { total: number; complete: number };
  scammerRegistry: { total: number; confirmed: number };
  listings: { total: number };
  fraudScores: { critical: number; avgScore: number };
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

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-6 py-4">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-sm text-primary-foreground/70 mt-0.5">{label}</p>
    </div>
  );
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

export default function HomePage() {
  const { data: stats } = useStats();

  const reportsAnalyzed = stats?.reports.complete ?? 0;
  const scammersTracked = stats?.scammerRegistry.total ?? 0;
  const listingsIndexed = stats?.listings.total ?? 0;
  const criticalCases = stats?.fraudScores.critical ?? 0;

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

      {/* How it works */}
      <section className="py-20 bg-slate-50 px-4">
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
              <div key={step} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
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
      <section className="py-20 bg-white px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">6 Signals. One Score.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Every report is built from six independently-weighted fraud signals. Each signal is explained in plain language so you know exactly why a listing is flagged.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {SIGNALS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-6 rounded-2xl border border-slate-100 hover:border-primary/20 hover:bg-slate-50 transition-colors">
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

      {/* CTA banner */}
      <section className="py-16 bg-primary/5 border-t border-primary/10 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <Users className="h-10 w-10 text-primary mx-auto mb-4 opacity-60" />
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Protect yourself before you pay a deposit.
          </h2>
          <p className="text-slate-600 mb-8 max-w-xl mx-auto">
            A KSh 500 fraud check could save you KSh 30,000–200,000 in lost deposits. Check any listing in under 5 minutes.
          </p>
          <Link href="/check">
            <Button size="lg" className="h-13 px-10 text-base font-semibold">
              Check a Property Now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
