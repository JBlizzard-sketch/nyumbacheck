import { pgTable, text, serial, timestamp, integer, real, jsonb, boolean } from "drizzle-orm/pg-core";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name"),
  company: text("company"),
  email: text("email"),
  reputationScore: real("reputation_score"),
  totalListings: integer("total_listings").notNull().default(0),
  ghostListingRate: real("ghost_listing_rate"),
  priceConsistencyScore: real("price_consistency_score"),
  duplicateListingRate: real("duplicate_listing_rate"),
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
  normalised: text("normalised").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export type Agent = typeof agentsTable.$inferSelect;
export type InsertAgent = typeof agentsTable.$inferInsert;

export type AgentPhone = typeof agentPhoneNumbersTable.$inferSelect;
export type InsertAgentPhone = typeof agentPhoneNumbersTable.$inferInsert;
