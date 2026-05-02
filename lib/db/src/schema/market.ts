import { pgTable, text, serial, timestamp, integer, real, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const neighbourhoodsTable = pgTable("neighbourhoods", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Aliases people use when listing (fed into address normaliser)
  aliases: text("aliases").array(),
  city: text("city").notNull().default("Nairobi"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  isTracked: integer("is_tracked").notNull().default(1),
});

// Daily aggregated market data snapshot per neighbourhood + listing type
export const marketSnapshotsTable = pgTable("market_snapshots", {
  id: serial("id").primaryKey(),
  neighbourhoodId: integer("neighbourhood_id").notNull().references(() => neighbourhoodsTable.id),
  listingType: text("listing_type").$type<"rent" | "sale">().notNull(),
  snapshotDate: date("snapshot_date").notNull(),

  // Volume
  activeListings: integer("active_listings").notNull().default(0),
  newListings: integer("new_listings").notNull().default(0),
  removedListings: integer("removed_listings").notNull().default(0),
  // After dedup — real unique properties
  uniqueProperties: integer("unique_properties").notNull().default(0),
  duplicateRate: real("duplicate_rate"), // 0-1

  // Pricing
  medianPriceKsh: real("median_price_ksh"),
  meanPriceKsh: real("mean_price_ksh"),
  p25PriceKsh: real("p25_price_ksh"),
  p75PriceKsh: real("p75_price_ksh"),
  medianPricePerSqftKsh: real("median_price_per_sqft_ksh"),

  // Velocity
  medianDaysOnMarket: real("median_days_on_market"),
  listingVelocityIndex: real("listing_velocity_index"), // normalised 0-100

  // Fraud
  highFraudListings: integer("high_fraud_listings").notNull().default(0),
  avgFraudScore: real("avg_fraud_score"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  neighbourhoodDateIdx: index("market_snapshots_neighbourhood_date_idx").on(table.neighbourhoodId, table.snapshotDate),
  dateIdx: index("market_snapshots_date_idx").on(table.snapshotDate),
}));

export const insertNeighbourhoodSchema = createInsertSchema(neighbourhoodsTable).omit({ id: true });
export type InsertNeighbourhood = z.infer<typeof insertNeighbourhoodSchema>;
export type Neighbourhood = typeof neighbourhoodsTable.$inferSelect;

export const insertMarketSnapshotSchema = createInsertSchema(marketSnapshotsTable).omit({ id: true, createdAt: true });
export type InsertMarketSnapshot = z.infer<typeof insertMarketSnapshotSchema>;
export type MarketSnapshot = typeof marketSnapshotsTable.$inferSelect;
