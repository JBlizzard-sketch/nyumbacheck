import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Search, LineChart, Bell, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <Layout>
      <section className="bg-primary text-primary-foreground py-20 px-4">
        <div className="container mx-auto max-w-5xl text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Don't get scammed on your next home.
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
            NyumbaCheck uses AI and a vast database of real estate data to detect ghost listings, duplicate properties, and fake agents in Nairobi.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/check">
              <Button size="lg" className="w-full sm:w-auto bg-white text-primary hover:bg-slate-100 text-lg h-14 px-8">
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

      <section className="py-20 bg-slate-50 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">We analyze thousands of data points to give you confidence before you visit or pay a deposit.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
              <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">1. Submit a Listing</h3>
              <p className="text-slate-600">Paste the URL from any major Kenyan property site or enter the address directly.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
              <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldAlert className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">2. We Analyze</h3>
              <p className="text-slate-600">Our system checks for stolen images, unrealistic prices, and blacklisted agents.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
              <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <LineChart className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">3. Get the Report</h3>
              <p className="text-slate-600">Receive a detailed risk score and market comparison to make an informed decision.</p>
            </div>
          </div>
        </div>
      </section>

    </Layout>
  );
}