import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { rawListingsTable } from "./listings";

// A dedup cluster is a group of raw listings determined to be the same physical property
export const dedupClustersTable = pgTable("dedup_clusters", {
  id: serial("id").primaryKey(),
  // Canonical representation
  normalisedAddress: text("normalised_address"),
  neighbourhood: text("neighbourhood"),
  bedrooms: integer("bedrooms"),
  propertyType: text("property_type"),

  // Pricing across all members
  priceMin: real("price_min"),
  priceMax: real("price_max"),
  priceMedian: real("price_median"),
  priceSpreadPct: real("price_spread_pct"), // (max-min)/min * 100

  // Confidence that this cluster is a real duplicate group
  confidenceScore: real("confidence_score").notNull().default(0), // 0-1

  // How many distinct platforms and agents appear in this cluster
  platformCount: integer("platform_count").notNull().default(1),
  agentCount: integer("agent_count").notNull().default(1),
  listingCount: integer("listing_count").notNull().default(1),

  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  neighbourhoodIdx: index("dedup_clusters_neighbourhood_idx").on(table.neighbourhood),
}));

export const dedupClusterMembersTable = pgTable("dedup_cluster_members", {
  id: serial("id").primaryKey(),
  clusterId: integer("cluster_id").notNull().references(() => dedupClustersTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => rawListingsTable.id, { onDelete: "cascade" }),
  // Why this listing was added to this cluster
  matchReasons: text("match_reasons").array(), // ["address_match", "image_hash", "agent_phone"]
  matchScore: real("match_score").notNull().default(0), // 0-1
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => ({
  clusterIdx: index("dedup_cluster_members_cluster_idx").on(table.clusterId),
  listingIdx: index("dedup_cluster_members_listing_idx").on(table.listingId),
}));

export const insertDedupClusterSchema = createInsertSchema(dedupClustersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDedupCluster = z.infer<typeof insertDedupClusterSchema>;
export type DedupCluster = typeof dedupClustersTable.$inferSelect;

export const insertDedupClusterMemberSchema = createInsertSchema(dedupClusterMembersTable).omit({ id: true });
export type InsertDedupClusterMember = z.infer<typeof insertDedupClusterMemberSchema>;
export type DedupClusterMember = typeof dedupClusterMembersTable.$inferSelect;
