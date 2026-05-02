import { pgTable, text, serial, timestamp, integer, real, jsonb, index } from "drizzle-orm/pg-core";
import { dedupClustersTable } from "./dedup";
import { rawListingsTable } from "./listings";

export type FraudSignal = {
  type: string;
  label: string;
  description: string;
  weight: number;
  value: number | string | null;
  contribution: number;
};

export const fraudScoresTable = pgTable("fraud_scores", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").references(() => rawListingsTable.id, { onDelete: "cascade" }),
  clusterId: integer("cluster_id").references(() => dedupClustersTable.id, { onDelete: "cascade" }),
  score: real("score").notNull(),
  riskLevel: text("risk_level").$type<"low" | "medium" | "high" | "critical">().notNull(),
  summary: text("summary").notNull(),
  platformCountScore: real("platform_count_score"),
  priceSpreadScore: real("price_spread_score"),
  agentPhoneOverlapScore: real("agent_phone_overlap_score"),
  daysOnMarketScore: real("days_on_market_score"),
  imageReuseScore: real("image_reuse_score"),
  priceAnomalyScore: real("price_anomaly_score"),
  signals: jsonb("signals").$type<FraudSignal[]>(),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  listingIdx: index("fraud_scores_listing_idx").on(table.listingId),
  clusterIdx: index("fraud_scores_cluster_idx").on(table.clusterId),
  scoreIdx: index("fraud_scores_score_idx").on(table.score),
}));

export const reportRequestsTable = pgTable("report_requests", {
  id: serial("id").primaryKey(),
  inputUrl: text("input_url"),
  inputAddress: text("input_address"),
  inputType: text("input_type").$type<"url" | "address">().notNull(),
  email: text("email").notNull(),
  userId: text("user_id"),
  status: text("status").$type<"pending" | "processing" | "complete" | "failed">().notNull().default("pending"),
  failureReason: text("failure_reason"),
  fraudScoreId: integer("fraud_score_id").references(() => fraudScoresTable.id),
  clusterId: integer("cluster_id").references(() => dedupClustersTable.id),
  reportUrl: text("report_url"),
  isPaid: integer("is_paid").notNull().default(0),
  paymentRef: text("payment_ref"),
  pricePaid: real("price_paid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("report_requests_email_idx").on(table.email),
  statusIdx: index("report_requests_status_idx").on(table.status),
}));

export type FraudScore = typeof fraudScoresTable.$inferSelect;
export type InsertFraudScore = typeof fraudScoresTable.$inferInsert;

export type ReportRequest = typeof reportRequestsTable.$inferSelect;
export type InsertReportRequest = typeof reportRequestsTable.$inferInsert;
