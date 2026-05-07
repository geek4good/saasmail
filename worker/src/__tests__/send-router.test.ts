import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  applyMigrations,
  cleanDb,
  createTestUser,
  createTestPerson,
  authFetch,
  getDb,
} from "./helpers";
import { people } from "../db/people.schema";
import { sentEmails } from "../db/sent-emails.schema";

describe("send router", () => {
  let apiKey: string;

  beforeAll(async () => {
    await applyMigrations();
  });

  beforeEach(async () => {
    await cleanDb();
    ({ apiKey } = await createTestUser());
  });

  describe("POST /api/send", () => {
    it("creates a people row for a new recipient", async () => {
      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: JSON.stringify({
          to: "newperson@example.com",
          fromAddress: "me@saasmail.test",
          subject: "Hello",
          bodyHtml: "<p>Hi</p>",
        }),
      });
      expect(res.status).toBe(201);

      const db = getDb();
      const rows = await db
        .select()
        .from(people)
        .where(eq(people.email, "newperson@example.com"));
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe("newperson@example.com");
    });

    it("populates sent_emails.personId for a new recipient", async () => {
      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: JSON.stringify({
          to: "newperson@example.com",
          fromAddress: "me@saasmail.test",
          subject: "Hello",
          bodyHtml: "<p>Hi</p>",
        }),
      });
      const body = (await res.json()) as { id: string };

      const db = getDb();
      const rows = await db
        .select()
        .from(sentEmails)
        .where(eq(sentEmails.id, body.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].personId).not.toBeNull();
    });

    it("reuses an existing people row when the recipient already exists", async () => {
      await createTestPerson({
        id: "existing-1",
        email: "existing@example.com",
      });

      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: JSON.stringify({
          to: "existing@example.com",
          fromAddress: "me@saasmail.test",
          subject: "Hi again",
          bodyHtml: "<p>Hi</p>",
        }),
      });
      const body = (await res.json()) as { id: string };

      const db = getDb();
      const peopleRows = await db
        .select()
        .from(people)
        .where(eq(people.email, "existing@example.com"));
      expect(peopleRows).toHaveLength(1);
      expect(peopleRows[0].id).toBe("existing-1");

      const sentRows = await db
        .select()
        .from(sentEmails)
        .where(eq(sentEmails.id, body.id));
      expect(sentRows[0].personId).toBe("existing-1");
    });
  });

  describe("GET /api/people/grouped after sending", () => {
    it("includes a recipient that has only received sent emails", async () => {
      const sendRes = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: JSON.stringify({
          to: "newperson@example.com",
          fromAddress: "me@saasmail.test",
          subject: "Hello",
          bodyHtml: "<p>Hi</p>",
        }),
      });
      expect(sendRes.status).toBe(201);

      const res = await authFetch("/api/people/grouped", { apiKey });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: Array<{ email: string; totalCount: number }>;
        total: number;
      };
      expect(body.total).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe("newperson@example.com");
      expect(body.data[0].totalCount).toBe(1);
    });
  });
});
