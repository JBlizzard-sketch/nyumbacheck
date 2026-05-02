import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const platformsTable = pgTable("platforms", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  scraperEnabled: boolean("scraper_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Platform = typeof platformsTable.$inferSelect;
export type InsertPlatform = typeof platformsTable.$inferInsert;
