import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect, Link } from 'wouter';
import { QueryClientProvider, useQueryClient, QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Layout } from "@/components/layout";

// Pages
import HomePage from "@/pages/home";
import CheckPage from "@/pages/check";
import ReportPage from "@/pages/report";
import MarketPage from "@/pages/market";
import ScammerPage from "@/pages/scammer";
import MyReportsPage from "@/pages/my-reports";
import AdminPage from "@/pages/admin";
import NotFoundPage from "@/pages/not-found";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#1a3a2a",
    colorForeground: "#1a2a22",
    colorMutedForeground: "#66776c",
    colorDanger: "#e53e3e",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#1a2a22",
    colorNeutral: "#e2e8f0",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white dark:bg-slate-900 rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary font-medium hover:text-primary/90",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-destructive",
    logoBox: "mb-6",
    logoImage: "h-10 mx-auto",
    socialButtonsBlockButton: "border-border hover:bg-secondary",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground",
    formFieldInput: "bg-background border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary",
    footerAction: "mt-6",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border-destructive text-destructive",
    otpCodeFieldInput: "border-border focus:border-primary focus:ring-1 focus:ring-primary",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function SignInPage() {
  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </Layout>
  );
}

function SignUpPage() {
  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </Layout>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/my-reports" />
      </Show>
      <Show when="signed-out">
        <HomePage />
      </Show>
    </>
  );
}

function ProtectedMyReports() {
  return (
    <>
      <Show when="signed-in">
        <MyReportsPage />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider 
      publishableKey={clerkPubKey} 
      proxyUrl={clerkProxyUrl} 
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`} 
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/check" component={CheckPage} />
          <Route path="/reports/:id" component={ReportPage} />
          <Route path="/market" component={MarketPage} />
          <Route path="/scammer" component={ScammerPage} />
          <Route path="/my-reports" component={ProtectedMyReports} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFoundPage} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
