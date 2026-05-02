import { Link } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Shield, Home, TrendingUp, Phone, List, LogOut, ShieldCheck, Users } from "lucide-react";
import { Button } from "./ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <Shield className="h-6 w-6" />
            <span>NyumbaCheck</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/check" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
              <Home className="h-4 w-4" /> Check Property
            </Link>
            <Link href="/market" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> Market
            </Link>
            <Link href="/scammer" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
              <Phone className="h-4 w-4" /> Scammer Lookup
            </Link>
            <Link href="/agents" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
              <Users className="h-4 w-4" /> Agents
            </Link>
            <Link href="/verify" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" /> Get Verified
            </Link>
            <Show when="signed-in">
              <Link href="/my-reports" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
                <List className="h-4 w-4" /> My Reports
              </Link>
            </Show>
          </nav>
          <div className="flex items-center gap-4">
            <Show when="signed-in">
              <span className="text-sm text-slate-600 hidden sm:inline-block">{user?.primaryEmailAddress?.emailAddress}</span>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </Button>
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in" className="text-sm font-medium text-primary hover:text-primary/80 px-4 py-2">
                Sign In
              </Link>
              <Link href="/sign-up">
                <Button>Get Started</Button>
              </Link>
            </Show>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t bg-white py-12 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-bold text-slate-900 text-lg">NyumbaCheck</span>
              </div>
              <p className="text-sm text-slate-500 max-w-xs">Protecting Nairobi real estate from fraud. The only AI-powered property checker built for Kenya.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
              <div>
                <p className="font-semibold text-slate-700 mb-3">Tools</p>
                <div className="space-y-2 text-slate-500">
                  <div><Link href="/check" className="hover:text-primary transition-colors">Check Property</Link></div>
                  <div><Link href="/scammer" className="hover:text-primary transition-colors">Scammer Lookup</Link></div>
                  <div><Link href="/market" className="hover:text-primary transition-colors">Market Intel</Link></div>
                  <div><Link href="/agents" className="hover:text-primary transition-colors">Agent Directory</Link></div>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-700 mb-3">Landlords</p>
                <div className="space-y-2 text-slate-500">
                  <div><Link href="/verify" className="hover:text-primary transition-colors">Get Verified</Link></div>
                  <div><Link href="/verify" className="hover:text-primary transition-colors">Trust Badge</Link></div>
                </div>
              </div>
              <div>
                <p className="font-semibold text-slate-700 mb-3">Account</p>
                <div className="space-y-2 text-slate-500">
                  <div><Link href="/sign-up" className="hover:text-primary transition-colors">Sign Up</Link></div>
                  <div><Link href="/my-reports" className="hover:text-primary transition-colors">My Reports</Link></div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col md:flex-row items-center justify-between text-slate-400 text-xs gap-2">
            <p>© 2026 NyumbaCheck. Protecting Nairobi real estate from fraud.</p>
            <p>Built for Kenya · Reports in KSh · Available across Nairobi</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
