import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    magicUserId: text("magic_user_id").notNull(),
    email: text("email"),
    displayName: text("display_name").notNull(),
    walletAddress: text("wallet_address").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_magic_user_id_idx").on(table.magicUserId)],
);

export type User = typeof users.$inferSelect;
