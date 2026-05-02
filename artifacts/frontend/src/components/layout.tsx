import { Link } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Shield, Home, TrendingUp, Phone, List, LogOut } from "lucide-react";
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
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between text-slate-500 text-sm">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Shield className="h-5 w-5" />
            <span className="font-semibold text-slate-700">NyumbaCheck</span>
          </div>
          <p>Protecting Nairobi real estate from fraud.</p>
        </div>
      </footer>
    </div>
  );
}
