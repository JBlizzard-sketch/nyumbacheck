import { pgTable, text, serial, timestamp, integer, real, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { rawListingsTable } from "./listings";

export const priceAlertsTable = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Clerk user ID
  email: text("email").notNull(),
  phoneNumber: text("phone_number"), // for SMS via Africa's Talking

  alertType: text("alert_type").$type<"listing_watch" | "search_alert">().notNull(),

  // For listing_watch — track a specific listing
  listingId: integer("listing_id").references(() => rawListingsTable.id),

  // For search_alert — match criteria
  neighbourhood: text("neighbourhood"),
  listingType: text("listing_type").$type<"rent" | "sale">(),
  minBedrooms: integer("min_bedrooms"),
  maxBedrooms: integer("max_bedrooms"),
  minPriceKsh: real("min_price_ksh"),
  maxPriceKsh: real("max_price_ksh"),
  propertyType: text("property_type"),

  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scammerRegistryTable = pgTable("scammer_registry", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  normalisedPhone: text("normalised_phone").notNull(),
  reportCount: integer("report_count").notNull().default(1),
  // How many listings are linked to this number
  linkedListingCount: integer("linked_listing_count").notNull().default(0),
  evidenceUrls: jsonb("evidence_urls").$type<string[]>(),
  notes: text("notes"),
  isConfirmed: boolean("is_confirmed").notNull().default(false),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifiedListingsTable = pgTable("verified_listings", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => rawListingsTable.id),
  userId: text("user_id").notNull(), // Clerk user ID of the landlord
  status: text("status").$type<"pending" | "in_review" | "verified" | "rejected">().notNull().default("pending"),
  badgeCode: text("badge_code").unique(), // embed code for verified badge widget
  documentsSubmitted: jsonb("documents_submitted").$type<string[]>(),
  reviewNotes: text("review_notes"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
  pricePaid: real("price_paid"),
  paymentRef: text("payment_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scrapeJobsTable = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  platformId: integer("platform_id").notNull(),
  jobType: text("job_type").$type<"full" | "incremental">().notNull().default("incremental"),
  status: text("status").$type<"queued" | "running" | "complete" | "failed">().notNull().default("queued"),
  listingsScraped: integer("listings_scraped").notNull().default(0),
  listingsNew: integer("listings_new").notNull().default(0),
  listingsUpdated: integer("listings_updated").notNull().default(0),
  errorLog: text("error_log"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPriceAlertSchema = createInsertSchema(priceAlertsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlertsTable.$inferSelect;

export const insertScammerSchema = createInsertSchema(scammerRegistryTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScammer = z.infer<typeof insertScammerSchema>;
export type ScammerEntry = typeof scammerRegistryTable.$inferSelect;

export const insertScrapeJobSchema = createInsertSchema(scrapeJobsTable).omit({ id: true, createdAt: true });
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;
export type ScrapeJob = typeof scrapeJobsTable.$inferSelect;
