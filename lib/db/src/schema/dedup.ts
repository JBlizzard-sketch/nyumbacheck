import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { rawListingsTable } from "./listings";

export const dedupClustersTable = pgTable("dedup_clusters", {
  id: serial("id").primaryKey(),
  canonicalListingId: integer("canonical_listing_id").references(() => rawListingsTable.id),
  neighbourhood: text("neighbourhood"),
  listingType: text("listing_type").$type<"rent" | "sale">(),
  bedrooms: integer("bedrooms"),
  priceMin: real("price_min"),
  priceMax: real("price_max"),
  priceSpreadPct: real("price_spread_pct"),
  platformCount: integer("platform_count").notNull().default(1),
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
  matchReasons: text("match_reasons").array(),
  matchScore: real("match_score"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
}, (table) => ({
  clusterIdx: index("dedup_cluster_members_cluster_idx").on(table.clusterId),
  listingIdx: index("dedup_cluster_members_listing_idx").on(table.listingId),
}));

export type DedupCluster = typeof dedupClustersTable.$inferSelect;
export type InsertDedupCluster = typeof dedupClustersTable.$inferInsert;

export type DedupClusterMember = typeof dedupClusterMembersTable.$inferSelect;
export type InsertDedupClusterMember = typeof dedupClusterMembersTable.$inferInsert;
