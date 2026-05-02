import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Shield, Home, TrendingUp, Phone, List, LogOut, ShieldCheck, Users, Menu, X, ChevronRight, User } from "lucide-react";
import { Button } from "./ui/button";

function getInitials(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return "?";
  const first = user.firstName?.[0] ?? "";
  const last = user.lastName?.[0] ?? "";
  if (first || last) return (first + last).toUpperCase();
  return (user.primaryEmailAddress?.emailAddress?.[0] ?? "?").toUpperCase();
}

function UserMenu({
  user,
  signOut,
  location,
}: {
  user: ReturnType<typeof useUser>["user"];
  signOut: () => void;
  location: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = getInitials(user);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Account menu"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-52 bg-white border border-slate-100 rounded-xl shadow-xl py-1.5 z-50">
          <div className="px-4 py-2.5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-800 truncate">{initials}</p>
            <p className="text-xs text-slate-400 truncate">{email}</p>
          </div>
          {[
            { href: "/account",    label: "My Account",  Icon: User },
            { href: "/my-reports", label: "My Reports",  Icon: List },
          ].map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              <div className={`flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                location === href ? "text-primary font-semibold bg-primary/5" : "text-slate-700 hover:bg-slate-50"
              }`}>
                <Icon className="h-4 w-4 flex-shrink-0" /> {label}
              </div>
            </Link>
          ))}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV_LINKS = [
  { href: "/check", label: "Check Property", icon: Home },
  { href: "/market", label: "Market", icon: TrendingUp },
  { href: "/scammer", label: "Scammer Lookup", icon: Phone },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/verify", label: "Get Verified", icon: ShieldCheck },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [location]);

  // Lock body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      <header className="sticky top-0 z-50 w-full border-b bg-white">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <Shield className="h-6 w-6" />
            <span>NyumbaCheck</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors flex items-center gap-1 ${
                  location === href ? "text-primary" : "text-slate-600 hover:text-primary"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
            <Show when="signed-in">
              <Link
                href="/my-reports"
                className={`text-sm font-medium transition-colors flex items-center gap-1 ${
                  location === "/my-reports" ? "text-primary" : "text-slate-600 hover:text-primary"
                }`}
              >
                <List className="h-4 w-4" /> My Reports
              </Link>
            </Show>
          </nav>

          {/* Desktop auth */}
          <div className="hidden lg:flex items-center gap-3">
            <Show when="signed-in">
              <UserMenu user={user} signOut={signOut} location={location} />
            </Show>
            <Show when="signed-out">
              <Link href="/sign-in" className="text-sm font-medium text-slate-600 hover:text-primary px-3 py-2">
                Sign In
              </Link>
              <Link href="/sign-up">
                <Button size="sm">Get Started</Button>
              </Link>
            </Show>
          </div>

          {/* Mobile: auth shortcut + hamburger */}
          <div className="flex lg:hidden items-center gap-2">
            <Show when="signed-out">
              <Link href="/sign-in" className="text-sm font-medium text-primary px-3 py-1.5 hidden sm:block">
                Sign In
              </Link>
            </Show>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile slide-in drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out lg:hidden ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-16 border-b flex-shrink-0">
          <div className="flex items-center gap-2 font-bold text-primary">
            <Shield className="h-5 w-5" />
            <span>NyumbaCheck</span>
          </div>
          <button onClick={() => setMenuOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer links */}
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div
                className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                  location === href
                    ? "bg-primary/8 text-primary font-semibold border-r-2 border-primary"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                <span className="text-sm font-medium">{label}</span>
                <ChevronRight className="h-4 w-4 ml-auto text-slate-300" />
              </div>
            </Link>
          ))}
          <Show when="signed-in">
            {[
              { href: "/account",    label: "My Account", icon: User },
              { href: "/my-reports", label: "My Reports",  icon: List },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <div
                  className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                    location === href
                      ? "bg-primary/8 text-primary font-semibold border-r-2 border-primary"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                  <ChevronRight className="h-4 w-4 ml-auto text-slate-300" />
                </div>
              </Link>
            ))}
          </Show>
        </nav>

        {/* Drawer footer — auth */}
        <div className="border-t px-5 py-4 flex-shrink-0">
          <Show when="signed-in">
            <p className="text-xs text-slate-400 truncate mb-3">
              {user?.primaryEmailAddress?.emailAddress}
            </p>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </Show>
          <Show when="signed-out">
            <div className="flex flex-col gap-2">
              <Link href="/sign-up">
                <Button size="sm" className="w-full">Get Started — Free</Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="sm" className="w-full">Sign In</Button>
              </Link>
            </div>
          </Show>
        </div>
      </div>

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
              <p className="text-sm text-slate-500 max-w-xs">
                Protecting Nairobi real estate from fraud. The only AI-powered property checker built for Kenya.
              </p>
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
                  <div><Link href="/account" className="hover:text-primary transition-colors">My Account</Link></div>
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
