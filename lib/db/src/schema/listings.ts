import { pgTable, text, serial, timestamp, integer, real, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { platformsTable } from "./platforms";
import { agentsTable } from "./agents";

export const rawListingsTable = pgTable("raw_listings", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull().references(() => platformsTable.id),
  platformListingId: text("platform_listing_id").notNull(), // ID on the source platform
  url: text("url").notNull(),
  title: text("title"),
  listingType: text("listing_type").$type<"rent" | "sale">().notNull(),

  // Pricing
  priceKsh: real("price_ksh"),
  pricePerSqftKsh: real("price_per_sqft_ksh"),
  currency: text("currency").notNull().default("KES"),

  // Property details
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  sqft: real("sqft"),
  propertyType: text("property_type"), // apartment, house, studio, land, commercial

  // Location
  rawAddress: text("raw_address"),
  normalisedAddress: text("normalised_address"),
  neighbourhood: text("neighbourhood"), // canonical neighbourhood name
  latitude: real("latitude"),
  longitude: real("longitude"),

  // Agent
  agentId: integer("agent_id").references(() => agentsTable.id),
  agentRawName: text("agent_raw_name"),
  agentRawPhone: text("agent_raw_phone"),

  // Images
  imageUrls: jsonb("image_urls").$type<string[]>(),
  imageHashes: jsonb("image_hashes").$type<string[]>(), // pHash values

  // Temporal
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  listedAt: timestamp("listed_at"), // date from the platform if available
  daysOnMarket: integer("days_on_market"),
  isActive: boolean("is_active").notNull().default(true),
  isAvailable: boolean("is_available").notNull().default(true),

  // Raw data
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  platformListingIdx: index("raw_listings_platform_listing_idx").on(table.platformId, table.platformListingId),
  neighbourhoodIdx: index("raw_listings_neighbourhood_idx").on(table.neighbourhood),
  agentIdx: index("raw_listings_agent_idx").on(table.agentId),
}));

export const insertRawListingSchema = createInsertSchema(rawListingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRawListing = z.infer<typeof insertRawListingSchema>;
export type RawListing = typeof rawListingsTable.$inferSelect;
