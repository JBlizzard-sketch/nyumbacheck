import { pgTable, text, serial, timestamp, integer, real, date, index } from "drizzle-orm/pg-core";

export const neighbourhoodsTable = pgTable("neighbourhoods", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  aliases: text("aliases").array(),
  city: text("city").notNull().default("Nairobi"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  isTracked: integer("is_tracked").notNull().default(1),
});

export const marketSnapshotsTable = pgTable("market_snapshots", {
  id: serial("id").primaryKey(),
  neighbourhoodId: integer("neighbourhood_id").notNull().references(() => neighbourhoodsTable.id),
  listingType: text("listing_type").$type<"rent" | "sale">().notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  activeListings: integer("active_listings").notNull().default(0),
  newListings: integer("new_listings").notNull().default(0),
  removedListings: integer("removed_listings").notNull().default(0),
  uniqueProperties: integer("unique_properties").notNull().default(0),
  duplicateRate: real("duplicate_rate"),
  medianPriceKsh: real("median_price_ksh"),
  meanPriceKsh: real("mean_price_ksh"),
  p25PriceKsh: real("p25_price_ksh"),
  p75PriceKsh: real("p75_price_ksh"),
  medianPricePerSqftKsh: real("median_price_per_sqft_ksh"),
  medianDaysOnMarket: real("median_days_on_market"),
  listingVelocityIndex: real("listing_velocity_index"),
  highFraudListings: integer("high_fraud_listings").notNull().default(0),
  avgFraudScore: real("avg_fraud_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  neighbourhoodDateIdx: index("market_snapshots_neighbourhood_date_idx").on(table.neighbourhoodId, table.snapshotDate),
  dateIdx: index("market_snapshots_date_idx").on(table.snapshotDate),
}));

export type Neighbourhood = typeof neighbourhoodsTable.$inferSelect;
export type InsertNeighbourhood = typeof neighbourhoodsTable.$inferInsert;

export type MarketSnapshot = typeof marketSnapshotsTable.$inferSelect;
export type InsertMarketSnapshot = typeof marketSnapshotsTable.$inferInsert;
