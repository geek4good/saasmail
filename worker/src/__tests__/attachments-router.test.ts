import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
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

describe("attachments router", () => {
  let apiKey: string;

  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await cleanDb();
    ({ apiKey } = await createTestUser());
  });

  async function createTestAttachment() {
    const db = getDb();
    await createTestPerson({ id: "s1", email: "a@test.com" });
    await createTestEmail({ id: "e1", personId: "s1" });

    const content = new TextEncoder().encode("Hello PDF");
    const r2Key = "attachments/e1/test.pdf";
    await env.R2.put(r2Key, content, {
      httpMetadata: { contentType: "application/pdf" },
    });

    await db.insert(attachments).values({
      id: "att-1",
      emailId: "e1",
      filename: "test.pdf",
      contentType: "application/pdf",
      size: content.byteLength,
      r2Key,
      contentId: null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  }

  async function createTestSentAttachment() {
    const db = getDb();
    await createTestPerson({ id: "s1", email: "a@test.com" });

    const now = Math.floor(Date.now() / 1000);
    const { sentEmails } = await import("../db/sent-emails.schema");
    await db.insert(sentEmails).values({
      id: "se1",
      personId: "s1",
      fromAddress: "me@test.com",
      toAddress: "a@test.com",
      subject: "Test",
      bodyHtml: "<p>Hi</p>",
      status: "sent",
      sentAt: now,
      createdAt: now,
    });

    const content = new TextEncoder().encode("Sent file content");
    const r2Key = "sent-attachments/se1/att-s1/report.pdf";
    await env.R2.put(r2Key, content, {
      httpMetadata: { contentType: "application/pdf" },
    });

    await db.insert(attachments).values({
      id: "att-s1",
      sentEmailId: "se1",
      emailId: null,
      filename: "report.pdf",
      contentType: "application/pdf",
      size: content.byteLength,
      r2Key,
      contentId: null,
      createdAt: now,
    });
  }

  describe("GET /api/attachments/:id", () => {
    it("downloads a received attachment with correct headers", async () => {
      await createTestAttachment();

      const res = await authFetch("/api/attachments/att-1", { apiKey });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toContain("test.pdf");
    });

    it("downloads a sent attachment with correct headers", async () => {
      await createTestSentAttachment();

      const res = await authFetch("/api/attachments/att-s1", { apiKey });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toContain("report.pdf");
    });

    it("returns 404 for missing attachment", async () => {
      const res = await authFetch("/api/attachments/nonexistent", {
        apiKey,
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 when R2 object missing", async () => {
      const db = getDb();
      await createTestPerson({ id: "s1", email: "a@test.com" });
      await createTestEmail({ id: "e1", personId: "s1" });

      await db.insert(attachments).values({
        id: "att-orphan",
        emailId: "e1",
        filename: "gone.pdf",
        contentType: "application/pdf",
        size: 100,
        r2Key: "nonexistent/gone.pdf",
        contentId: null,
        createdAt: Math.floor(Date.now() / 1000),
      });

      const res = await authFetch("/api/attachments/att-orphan", {
        apiKey,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/attachments/:id/inline", () => {
    it("serves a received attachment inline with cache headers", async () => {
      await createTestAttachment();

      const res = await authFetch("/api/attachments/att-1/inline", {
        apiKey,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toContain("inline");
      expect(res.headers.get("Content-Disposition")).toContain("test.pdf");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
    });

    it("serves a sent attachment inline with cache headers", async () => {
      await createTestSentAttachment();

      const res = await authFetch("/api/attachments/att-s1/inline", {
        apiKey,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toContain("inline");
      expect(res.headers.get("Content-Disposition")).toContain("report.pdf");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
    });

    it("returns 404 for missing attachment", async () => {
      const res = await authFetch("/api/attachments/nonexistent/inline", {
        apiKey,
      });
      expect(res.status).toBe(404);
    });
  });
});
