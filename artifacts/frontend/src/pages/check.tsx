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
import { ShieldCheck, Loader2 } from "lucide-react";
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
      ...(mode === "url" ? { inputUrl: url } : { inputAddress: address })
    };

    submitReport.mutate({ data: payload }, {
      onSuccess: (data) => {
        addReportToLocalStorage(email, data.id);
        toast.success("Property submitted for analysis!");
        setLocation(`/reports/${data.id}`);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to submit report");
      }
    });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Check a Property</h1>
          <p className="text-slate-600">Enter a listing URL or address to generate a comprehensive fraud risk report.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Property Details</CardTitle>
            <CardDescription>We'll analyze the property and email you the results.</CardDescription>
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
                  <p className="text-xs text-slate-500">Supports BuyRentKenya, Property24, Jumia House, and more.</p>
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

              <Button type="submit" className="w-full h-12 text-lg" disabled={submitReport.isPending}>
                {submitReport.isPending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing...</>
                ) : (
                  "Generate Fraud Report"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}