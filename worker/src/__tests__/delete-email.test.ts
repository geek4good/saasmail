import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  applyMigrations,
  cleanDb,
  createTestUser,
  createTestPerson,
  createTestEmail,
  authFetch,
  getDb,
} from "./helpers";
import { attachments } from "../db/attachments.schema";
import { emails } from "../db/emails.schema";
import { sentEmails } from "../db/sent-emails.schema";
import { people } from "../db/people.schema";
import { eq } from "drizzle-orm";

describe("DELETE /api/emails/:id", () => {
  let apiKey: string;

  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await cleanDb();
    ({ apiKey } = await createTestUser());
  });

  it("deletes a received email and returns success", async () => {
    await createTestPerson({ id: "s1", unreadCount: 1, totalCount: 2 });
    await createTestEmail({ id: "e1", personId: "s1" });

    const res = await authFetch("/api/emails/e1", {
      apiKey,
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.attachmentsDeleted).toBe(0);

    // Email should be gone
    const db = getDb();
    const rows = await db.select().from(emails).where(eq(emails.id, "e1"));
    expect(rows.length).toBe(0);
  });

  it("deletes a received email and its attachment DB records", async () => {
    await createTestPerson({ id: "s1", unreadCount: 0, totalCount: 1 });
    await createTestEmail({ id: "e1", personId: "s1", isRead: 1 });

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(attachments).values({
      id: "att-1",
      emailId: "e1",
      filename: "test.pdf",
      contentType: "application/pdf",
      size: 1024,
      r2Key: "attachments/e1/test.pdf",
      contentId: null,
      createdAt: now,
    });

    const res = await authFetch("/api/emails/e1", {
      apiKey,
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.attachmentsDeleted).toBe(1);

    // Attachment DB record should be gone
    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.emailId, "e1"));
    expect(attRows.length).toBe(0);
  });

  it("decrements person unread count when deleting an unread email", async () => {
    await createTestPerson({ id: "s1", unreadCount: 2, totalCount: 3 });
    await createTestEmail({ id: "e1", personId: "s1", isRead: 0 });

    await authFetch("/api/emails/e1", { apiKey, method: "DELETE" });

    const db = getDb();
    const senderRows = await db
      .select()
      .from(people)
      .where(eq(people.id, "s1"));
    expect(senderRows[0].unreadCount).toBe(1);
    expect(senderRows[0].totalCount).toBe(2);
  });

  it("does not decrement unread count when deleting a read email", async () => {
    await createTestPerson({ id: "s1", unreadCount: 1, totalCount: 2 });
    await createTestEmail({ id: "e1", personId: "s1", isRead: 1 });

    await authFetch("/api/emails/e1", { apiKey, method: "DELETE" });

    const db = getDb();
    const senderRows = await db
      .select()
      .from(people)
      .where(eq(people.id, "s1"));
    expect(senderRows[0].unreadCount).toBe(1);
    expect(senderRows[0].totalCount).toBe(1);
  });

  it("deletes a sent email", async () => {
    await createTestPerson({ id: "s1" });

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(sentEmails).values({
      id: "se1",
      personId: "s1",
      fromAddress: "me@saasmail.test",
      toAddress: "alice@example.com",
      subject: "Test",
      bodyHtml: "<p>Hi</p>",
      bodyText: "Hi",
      status: "sent",
      sentAt: now,
      createdAt: now,
    });

    const res = await authFetch("/api/emails/se1", {
      apiKey,
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    const rows = await db
      .select()
      .from(sentEmails)
      .where(eq(sentEmails.id, "se1"));
    expect(rows.length).toBe(0);
  });

  it("deletes a sent email and its attachment DB records", async () => {
    await createTestPerson({ id: "s1" });

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    await db.insert(sentEmails).values({
      id: "se1",
      personId: "s1",
      fromAddress: "me@saasmail.test",
      toAddress: "alice@example.com",
      subject: "Test",
      bodyHtml: "<p>Hi</p>",
      bodyText: "Hi",
      status: "sent",
      sentAt: now,
      createdAt: now,
    });

    await db.insert(attachments).values({
      id: "att-sent-1",
      sentEmailId: "se1",
      emailId: null,
      filename: "report.pdf",
      contentType: "application/pdf",
      size: 2048,
      r2Key: "sent-attachments/se1/report.pdf",
      contentId: null,
      createdAt: now,
    });

    const res = await authFetch("/api/emails/se1", {
      apiKey,
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.attachmentsDeleted).toBe(1);

    // Sent email should be gone
    const sentRows = await db
      .select()
      .from(sentEmails)
      .where(eq(sentEmails.id, "se1"));
    expect(sentRows.length).toBe(0);

    // Attachment DB record should be gone
    const attRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.sentEmailId, "se1"));
    expect(attRows.length).toBe(0);
  });

  it("returns 404 for non-existent email", async () => {
    const res = await authFetch("/api/emails/nonexistent", {
      apiKey,
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
