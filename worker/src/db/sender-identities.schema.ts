import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const senderIdentities = sqliteTable("sender_identities", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  displayMode: text("display_mode", { enum: ["thread", "chat"] })
    .notNull()
    .default("thread"),
  signatureHtml: text("signature_html"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
