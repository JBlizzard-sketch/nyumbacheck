import { pgTable, text, serial, timestamp, integer, real, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { platformsTable } from "./platforms";
import { agentsTable } from "./agents";

export const rawListingsTable = pgTable("raw_listings", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platformsTable.id),
  agentId: integer("agent_id").references(() => agentsTable.id),
  url: text("url").notNull().unique(),
  title: text("title"),
  listingType: text("listing_type").$type<"rent" | "sale">(),
  priceKsh: real("price_ksh"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  sqft: real("sqft"),
  propertyType: text("property_type"),
  rawAddress: text("raw_address"),
  normalisedAddress: text("normalised_address"),
  neighbourhood: text("neighbourhood"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  agentRawName: text("agent_raw_name"),
  agentRawPhone: text("agent_raw_phone"),
  imageUrls: jsonb("image_urls").$type<string[]>(),
  imageHashes: jsonb("image_hashes").$type<string[]>(),
  description: text("description"),
  daysOnMarket: integer("days_on_market"),
  isActive: boolean("is_active").notNull().default(true),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  neighbourhoodIdx: index("raw_listings_neighbourhood_idx").on(table.neighbourhood),
  platformIdx: index("raw_listings_platform_idx").on(table.platformId),
  activeIdx: index("raw_listings_active_idx").on(table.isActive),
}));

export type RawListing = typeof rawListingsTable.$inferSelect;
export type InsertRawListing = typeof rawListingsTable.$inferInsert;
