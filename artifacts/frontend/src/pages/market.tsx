import { useState } from "react";
import { useListNeighbourhoods, useGetMarketStats, useGetMarketTrends } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Home, Clock, BarChart2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function formatKsh(val: number | null | undefined): string {
  if (val == null) return "—";
  if (val >= 1_000_000) return `KSh ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `KSh ${(val / 1_000).toFixed(0)}K`;
  return `KSh ${val.toLocaleString()}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketPage() {
  const [neighbourhood, setNeighbourhood] = useState<string>("");
  const [listingType, setListingType] = useState<"rent" | "sale">("rent");
  const [days, setDays] = useState<number>(30);

  const { data: nbhds, isLoading: nbhdsLoading } = useListNeighbourhoods();

  const { data: stats, isLoading: statsLoading } = useGetMarketStats(
    { neighbourhood, listingType, days },
    { query: { enabled: !!neighbourhood } },
  );

  const { data: trends, isLoading: trendsLoading } = useGetMarketTrends(
    { neighbourhood, listingType, days: 90 },
    { query: { enabled: !!neighbourhood } },
  );

  const chartData = (trends?.dataPoints ?? []).map((dp) => ({
    date: new Date(dp.date).toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
    price: dp.medianPriceKsh,
    listings: dp.activeListings,
  }));

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Market Intelligence
          </h1>
          <p className="text-slate-600">Real-time price trends and market stats for Nairobi neighbourhoods.</p>
        </div>

        <div className="flex flex-wrap gap-4 mb-8">
          <div className="flex-1 min-w-[200px]">
            <Select
              value={neighbourhood}
              onValueChange={setNeighbourhood}
              disabled={nbhdsLoading}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={nbhdsLoading ? "Loading..." : "Select neighbourhood"} />
              </SelectTrigger>
              <SelectContent>
                {(nbhds?.neighbourhoods ?? []).map((n) => (
                  <SelectItem key={n.slug} value={n.slug}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={listingType} onValueChange={(v) => setListingType(v as "rent" | "sale")}>
            <SelectTrigger className="h-11 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rent">For Rent</SelectItem>
              <SelectItem value="sale">For Sale</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-11 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!neighbourhood && (
          <div className="text-center py-24 text-slate-400">
            <BarChart2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">Select a neighbourhood to view market data</p>
          </div>
        )}

        {neighbourhood && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {statsLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              ) : (
                <>
                  <StatCard
                    icon={Home}
                    label="Median Price"
                    value={formatKsh(stats?.medianPriceKsh)}
                    sub={`Per ${listingType === "rent" ? "month" : "unit"}`}
                  />
                  <StatCard
                    icon={BarChart2}
                    label="Active Listings"
                    value={stats?.activeListings?.toString() ?? "—"}
                    sub={`Last ${days} days`}
                  />
                  <StatCard
                    icon={Clock}
                    label="Avg Days on Market"
                    value={
                      stats?.medianDaysOnMarket != null
                        ? `${Math.round(stats.medianDaysOnMarket)} days`
                        : "—"
                    }
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="Price per sqft"
                    value={
                      stats?.medianPricePerSqftKsh != null
                        ? `KSh ${Math.round(stats.medianPricePerSqftKsh).toLocaleString()}`
                        : "—"
                    }
                  />
                </>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  Price Trend — {listingType === "rent" ? "Rental" : "Sale"} Market (90 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-400">
                    No trend data available yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        yAxisId="price"
                        orientation="left"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        tickFormatter={(v) => formatKsh(v)}
                        width={75}
                      />
                      <YAxis
                        yAxisId="listings"
                        orientation="right"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "Median Price" ? formatKsh(Number(value)) : value,
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="price"
                        name="Median Price"
                        stroke="#1a3a2a"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="listings"
                        type="monotone"
                        dataKey="listings"
                        name="Active Listings"
                        stroke="#86efac"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
