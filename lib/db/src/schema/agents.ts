import { pgTable, text, serial, timestamp, integer, real, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name"),
  company: text("company"),
  email: text("email"),
  // Composite reputation score 0-100
  reputationScore: real("reputation_score"),
  // Derived fields updated by pipeline
  totalListings: integer("total_listings").notNull().default(0),
  ghostListingRate: real("ghost_listing_rate"), // 0.0 - 1.0
  priceConsistencyScore: real("price_consistency_score"), // 0.0 - 1.0
  duplicateListingRate: real("duplicate_listing_rate"), // 0.0 - 1.0
  isVerified: boolean("is_verified").notNull().default(false),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  blacklistReason: text("blacklist_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const agentPhoneNumbersTable = pgTable("agent_phone_numbers", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  normalised: text("normalised").notNull(), // +254XXXXXXXXX format
  isPrimary: boolean("is_primary").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;

export const insertAgentPhoneSchema = createInsertSchema(agentPhoneNumbersTable).omit({ id: true });
export type InsertAgentPhone = z.infer<typeof insertAgentPhoneSchema>;
export type AgentPhone = typeof agentPhoneNumbersTable.$inferSelect;
