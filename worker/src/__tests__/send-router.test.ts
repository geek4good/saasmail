import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import {
  applyMigrations,
  cleanDb,
  createTestUser,
  createTestPerson,
  createTestEmail,
  authFetch,
  getDb,
} from "./helpers";
import { people } from "../db/people.schema";
import { sentEmails } from "../db/sent-emails.schema";
import { attachments } from "../db/attachments.schema";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const BASE_FIELDS = {
  to: "newperson@example.com",
  fromAddress: "me@saasmail.test",
  subject: "Hello",
  bodyHtml: "<p>Hi</p>",
};

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
        body: makeFormData(BASE_FIELDS),
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
        body: makeFormData(BASE_FIELDS),
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
        body: makeFormData({
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

    it("sends without attachments (regression)", async () => {
      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: makeFormData(BASE_FIELDS),
      });
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };

      const db = getDb();
      const attRows = await db
        .select()
        .from(attachments)
        .where(eq(attachments.sentEmailId, id));
      expect(attRows).toHaveLength(0);
    });

    it("stores sent attachment in DB and R2", async () => {
      const fd = makeFormData(BASE_FIELDS);
      fd.append("attachments", new File(["hello"], "hello.txt", { type: "text/plain" }));

      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };

      const db = getDb();
      const attRows = await db
        .select()
        .from(attachments)
        .where(eq(attachments.sentEmailId, id));
      expect(attRows).toHaveLength(1);
      expect(attRows[0].filename).toBe("hello.txt");
      expect(attRows[0].contentType).toBe("text/plain");
      expect(attRows[0].size).toBe(5);

      const r2Obj = await env.R2.get(attRows[0].r2Key);
      expect(r2Obj).not.toBeNull();
    });

    it("stores multiple attachments", async () => {
      const fd = makeFormData(BASE_FIELDS);
      fd.append("attachments", new File(["a"], "a.txt", { type: "text/plain" }));
      fd.append("attachments", new File(["b"], "b.txt", { type: "text/plain" }));

      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };

      const db = getDb();
      const attRows = await db
        .select()
        .from(attachments)
        .where(eq(attachments.sentEmailId, id));
      expect(attRows).toHaveLength(2);
    });

    it("rejects more than 10 attachments", async () => {
      const fd = makeFormData(BASE_FIELDS);
      for (let i = 0; i < 11; i++) {
        fd.append("attachments", new File(["x"], `f${i}.txt`, { type: "text/plain" }));
      }

      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/too many/i);
    });

    it("rejects attachments exceeding 25 MB total", async () => {
      const fd = makeFormData(BASE_FIELDS);
      fd.append(
        "attachments",
        new File([new Uint8Array(26 * 1024 * 1024)], "big.bin", {
          type: "application/octet-stream",
        }),
      );

      const res = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/25 mb/i);
    });
  });

  describe("POST /api/send/reply/:emailId", () => {
    it("stores attachment on freeform reply", async () => {
      const person = await createTestPerson({ id: "person-1", email: "alice@example.com" });
      const email = await createTestEmail({
        id: "email-1",
        personId: person.id,
        recipient: "me@saasmail.test",
        messageId: "<original@example.com>",
      });

      const fd = new FormData();
      fd.append("fromAddress", "me@saasmail.test");
      fd.append("bodyHtml", "<p>Reply</p>");
      fd.append(
        "attachments",
        new File(["data"], "reply.pdf", { type: "application/pdf" }),
      );

      const res = await authFetch(`/api/send/reply/${email.id}`, {
        apiKey,
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };

      const db = getDb();
      const attRows = await db
        .select()
        .from(attachments)
        .where(eq(attachments.sentEmailId, id));
      expect(attRows).toHaveLength(1);
      expect(attRows[0].filename).toBe("reply.pdf");
      expect(attRows[0].contentType).toBe("application/pdf");
    });

    it("sends a freeform reply without attachments (regression)", async () => {
      const person = await createTestPerson({ id: "person-2", email: "bob@example.com" });
      const email = await createTestEmail({
        id: "email-2",
        personId: person.id,
        recipient: "me@saasmail.test",
      });

      const fd = new FormData();
      fd.append("fromAddress", "me@saasmail.test");
      fd.append("bodyHtml", "<p>Reply</p>");

      const res = await authFetch(`/api/send/reply/${email.id}`, {
        apiKey,
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);
    });
  });

  describe("GET /api/people/grouped after sending", () => {
    it("includes a recipient that has only received sent emails", async () => {
      const sendRes = await authFetch("/api/send", {
        apiKey,
        method: "POST",
        body: makeFormData(BASE_FIELDS),
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
