import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id"),
    sentEmailId: text("sent_email_id"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    r2Key: text("r2_key").notNull(),
    contentId: text("content_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("attachments_email_id_idx").on(table.emailId),
    index("attachments_sent_email_id_idx").on(table.sentEmailId),
  ],
);
