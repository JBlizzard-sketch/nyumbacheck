import { pgTable, text, serial, timestamp, integer, real, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dedupClustersTable } from "./dedup";
import { rawListingsTable } from "./listings";

// A fraud score is computed for a listing or a dedup cluster
export const fraudScoresTable = pgTable("fraud_scores", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").references(() => rawListingsTable.id, { onDelete: "cascade" }),
  clusterId: integer("cluster_id").references(() => dedupClustersTable.id, { onDelete: "cascade" }),

  // Composite score 0-100 (higher = more suspicious)
  score: real("score").notNull(),
  riskLevel: text("risk_level").$type<"low" | "medium" | "high" | "critical">().notNull(),

  // Human-readable summary of why the score is what it is
  summary: text("summary").notNull(),

  // Component scores (0-100 each)
  platformCountScore: real("platform_count_score"),
  priceSpreadScore: real("price_spread_score"),
  agentPhoneOverlapScore: real("agent_phone_overlap_score"),
  daysOnMarketScore: real("days_on_market_score"),
  imageReuseScore: real("image_reuse_score"),
  priceAnomalyScore: real("price_anomaly_score"),

  // Full explainability data
  signals: jsonb("signals").$type<FraudSignal[]>(),

  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  listingIdx: index("fraud_scores_listing_idx").on(table.listingId),
  clusterIdx: index("fraud_scores_cluster_idx").on(table.clusterId),
  scoreIdx: index("fraud_scores_score_idx").on(table.score),
}));

export type FraudSignal = {
  type: string;
  label: string;
  description: string;
  weight: number;
  value: number | string | null;
  contribution: number; // contribution to the total score
};

export const reportRequestsTable = pgTable("report_requests", {
  id: serial("id").primaryKey(),
  // What the user submitted
  inputUrl: text("input_url"),
  inputAddress: text("input_address"),
  inputType: text("input_type").$type<"url" | "address">().notNull(),

  // Contact for delivery
  email: text("email").notNull(),
  userId: text("user_id"), // Clerk user ID if logged in

  // Status
  status: text("status").$type<"pending" | "processing" | "complete" | "failed">().notNull().default("pending"),
  failureReason: text("failure_reason"),

  // Results
  fraudScoreId: integer("fraud_score_id").references(() => fraudScoresTable.id),
  clusterId: integer("cluster_id").references(() => dedupClustersTable.id),
  reportUrl: text("report_url"), // S3/R2 URL for the PDF report

  // Payment
  isPaid: integer("is_paid").notNull().default(0), // 0 or 1
  paymentRef: text("payment_ref"),
  pricePaid: real("price_paid"), // in KES

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("report_requests_email_idx").on(table.email),
  statusIdx: index("report_requests_status_idx").on(table.status),
}));

export const insertFraudScoreSchema = createInsertSchema(fraudScoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFraudScore = z.infer<typeof insertFraudScoreSchema>;
export type FraudScore = typeof fraudScoresTable.$inferSelect;

export const insertReportRequestSchema = createInsertSchema(reportRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportRequest = z.infer<typeof insertReportRequestSchema>;
export type ReportRequest = typeof reportRequestsTable.$inferSelect;
