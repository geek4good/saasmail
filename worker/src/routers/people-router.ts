import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { desc, like, or, eq, sql, and, inArray } from "drizzle-orm";
import { people } from "../db/people.schema";
import { emails } from "../db/emails.schema";
import { attachments } from "../db/attachments.schema";
import { sentEmails } from "../db/sent-emails.schema";
import { json200Response, escapeLike, escapeFts } from "../lib/helpers";
import type { Variables } from "../variables";
import type { AllowedInboxes } from "../lib/inbox-permissions";

function peopleScopeClause(allowed: AllowedInboxes) {
  if (allowed.isAdmin) return sql``;
  if (allowed.inboxes.length === 0)
    return sql`AND s.id IN (SELECT NULL WHERE 0)`;
  // A person is in scope if they emailed one of our allowed inboxes OR if we
  // sent them mail from one of our allowed inboxes.
  return sql`AND s.id IN (
    SELECT person_id FROM emails WHERE recipient IN ${allowed.inboxes}
    UNION
    SELECT person_id FROM sent_emails WHERE from_address IN ${allowed.inboxes} AND person_id IS NOT NULL
  )`;
}

export const peopleRouter = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: Variables;
}>();

const PersonSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  recipient: z.string(),
  lastEmailAt: z.number(),
  unreadCount: z.number(),
  totalCount: z.number(),
  latestSubject: z.string().nullable().optional(),
});

// Grouped people (unique people, aggregated across all recipients)
const GroupedPersonSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  lastEmailAt: z.number(),
  unreadCount: z.number(),
  totalCount: z.number(),
  recipientCount: z.number(),
  recipients: z.array(z.string()),
  hasAttachment: z.number(),
});

const listGroupedPeopleRoute = createRoute({
  method: "get",
  path: "/grouped",
  tags: ["People"],
  description:
    "List people grouped by person (aggregated across all recipients).",
  request: {
    query: z.object({
      q: z
        .string()
        .optional()
        .openapi({ description: "Search person name/email" }),
      recipient: z.string().optional().openapi({
        description: "Filter to people who have emailed this inbox address",
      }),
      unread: z
        .enum(["1", "true"])
        .optional()
        .openapi({ description: "Only people with unread emails" }),
      hasAttachment: z
        .enum(["1", "true"])
        .optional()
        .openapi({ description: "Only people with downloadable attachments" }),
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(50),
    }),
  },
  responses: {
    ...json200Response(
      z.object({
        data: z.array(GroupedPersonSchema),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
      }),
      "Paginated list of grouped people",
    ),
  },
});

peopleRouter.openapi(listGroupedPeopleRoute, async (c) => {
  const db = c.get("db");
  const { q, recipient, unread, hasAttachment, page, limit } =
    c.req.valid("query");
  const offset = (page - 1) * limit;

  const allowed = c.get("allowedInboxes")!;
  const conditions: any[] = [];
  if (recipient) {
    conditions.push(
      sql`s.id IN (SELECT person_id FROM emails WHERE recipient = ${recipient})`,
    );
  }
  if (unread) {
    conditions.push(
      sql`s.id IN (SELECT person_id FROM emails WHERE is_read = 0)`,
    );
  }
  if (hasAttachment) {
    conditions.push(
      sql`s.id IN (SELECT e2.person_id FROM emails e2 JOIN ${attachments} a ON a.email_id = e2.id WHERE a.content_id IS NULL)`,
    );
  }
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const ftsQuery = escapeFts(q);
    const ftsInboxScope = allowed.isAdmin
      ? sql``
      : allowed.inboxes.length === 0
        ? sql`AND 0`
        : sql`AND emails.recipient IN ${allowed.inboxes}`;
    conditions.push(
      sql`(s.email LIKE ${pattern} ESCAPE '\\' OR s.name LIKE ${pattern} ESCAPE '\\'
        OR s.id IN (
          SELECT person_id FROM emails
          JOIN emails_fts ON emails.rowid = emails_fts.rowid
          WHERE emails_fts MATCH ${ftsQuery} ${ftsInboxScope}
        ))`,
    );
  }
  const scopeClause = peopleScopeClause(allowed);
  const extraConditions =
    conditions.length > 0
      ? sql`AND ${sql.join(conditions, sql` AND `)}`
      : sql``;
  const whereClause = sql`WHERE 1=1 ${extraConditions} ${scopeClause}`;

  // Aggregate over both received and sent emails so people we've composed to
  // appear in the list, not just senders who have emailed us. Sent rows
  // contribute to totalCount / lastEmailAt / recipientCount but never to
  // unreadCount (we read everything we send). Attachments are still computed
  // against received emails since sent emails don't have an attachments link.
  const activity = sql`(
    SELECT person_id, recipient AS inbox, received_at AS at, is_read
    FROM ${emails}
    UNION ALL
    SELECT person_id, from_address AS inbox, sent_at AS at, 1 AS is_read
    FROM ${sentEmails}
    WHERE person_id IS NOT NULL
  )`;

  const rows = await db.all<{
    id: string;
    email: string;
    name: string | null;
    lastEmailAt: number;
    unreadCount: number;
    totalCount: number;
    recipientCount: number;
    recipientsCsv: string | null;
    hasAttachment: number;
  }>(sql`
    SELECT
      s.id,
      s.email,
      s.name,
      MAX(e.at) AS lastEmailAt,
      SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) AS unreadCount,
      COUNT(*) AS totalCount,
      COUNT(DISTINCT e.inbox) AS recipientCount,
      GROUP_CONCAT(DISTINCT e.inbox) AS recipientsCsv,
      EXISTS(
        SELECT 1 FROM ${attachments} a
        JOIN ${emails} e2 ON e2.id = a.email_id
        WHERE e2.person_id = s.id
        AND a.content_id IS NULL
      ) AS hasAttachment
    FROM ${activity} e
    JOIN ${people} s ON s.id = e.person_id
    ${whereClause}
    GROUP BY s.id
    ORDER BY lastEmailAt DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const data = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    lastEmailAt: r.lastEmailAt,
    unreadCount: r.unreadCount,
    totalCount: r.totalCount,
    recipientCount: r.recipientCount,
    recipients: r.recipientsCsv ? r.recipientsCsv.split(",") : [],
    hasAttachment: r.hasAttachment,
  }));

  const countResult = await db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM (
      SELECT 1 FROM ${activity} e
      JOIN ${people} s ON s.id = e.person_id
      ${whereClause}
      GROUP BY s.id
    )
  `);
  const total = countResult[0]?.count ?? 0;

  return c.json({ data, total, page, limit }, 200);
});

const listPeopleRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["People"],
  description: "List people sorted by most recent email.",
  request: {
    query: z.object({
      q: z
        .string()
        .optional()
        .openapi({ description: "Search person name/email" }),
      recipient: z
        .string()
        .optional()
        .openapi({ description: "Filter by recipient address" }),
      personId: z
        .string()
        .optional()
        .openapi({ description: "Filter by person ID" }),
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(50),
    }),
  },
  responses: {
    ...json200Response(
      z.object({
        data: z.array(PersonSchema),
        total: z.number(),
        page: z.number(),
        limit: z.number(),
      }),
      "Paginated list of people",
    ),
  },
});

peopleRouter.openapi(listPeopleRoute, async (c) => {
  const db = c.get("db");
  const { q, recipient, personId, page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  // Build WHERE conditions for the emails table
  const conditions: any[] = [];

  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      sql`(s.email LIKE ${pattern} ESCAPE '\\' OR s.name LIKE ${pattern} ESCAPE '\\')`,
    );
  }

  if (recipient) {
    conditions.push(sql`e.recipient = ${recipient}`);
  }

  if (personId) {
    conditions.push(sql`s.id = ${personId}`);
  }

  const allowed = c.get("allowedInboxes")!;
  const scopeClause = peopleScopeClause(allowed);
  const extraConditions =
    conditions.length > 0
      ? sql`AND ${sql.join(conditions, sql` AND `)}`
      : sql``;
  const whereClause = sql`WHERE 1=1 ${extraConditions} ${scopeClause}`;

  // Group by (person, recipient) to get per-thread stats
  const rows = await db.all<{
    id: string;
    email: string;
    name: string | null;
    recipient: string;
    lastEmailAt: number;
    unreadCount: number;
    totalCount: number;
    latestSubject: string | null;
  }>(sql`
    SELECT
      s.id,
      s.email,
      s.name,
      e.recipient,
      MAX(e.received_at) AS lastEmailAt,
      SUM(CASE WHEN e.is_read = 0 THEN 1 ELSE 0 END) AS unreadCount,
      COUNT(*) AS totalCount,
      (
        SELECT e2.subject FROM emails e2
        WHERE e2.person_id = s.id AND e2.recipient = e.recipient
        ORDER BY e2.received_at DESC LIMIT 1
      ) AS latestSubject
    FROM ${emails} e
    JOIN ${people} s ON s.id = e.person_id
    ${whereClause}
    GROUP BY s.id, e.recipient
    ORDER BY lastEmailAt DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Get total count of (person, recipient) pairs
  const countResult = await db.all<{ count: number }>(sql`
    SELECT COUNT(*) AS count FROM (
      SELECT 1 FROM ${emails} e
      JOIN ${people} s ON s.id = e.person_id
      ${whereClause}
      GROUP BY s.id, e.recipient
    )
  `);
  const total = countResult[0]?.count ?? 0;

  return c.json({ data: rows, total, page, limit }, 200);
});

const getPersonRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["People"],
  description: "Get person detail.",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    ...json200Response(PersonSchema, "Person detail"),
  },
});

peopleRouter.openapi(getPersonRoute, async (c) => {
  const db = c.get("db");
  const { id } = c.req.valid("param");

  const rows = await db.select().from(people).where(eq(people.id, id)).limit(1);

  if (rows.length === 0) {
    return c.json({ error: "Person not found" }, 404);
  }

  const allowed = c.get("allowedInboxes")!;
  if (!allowed.isAdmin) {
    if (allowed.inboxes.length === 0) {
      return c.json({ error: "Person not found" }, 404);
    }
    const match = await db
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          eq(emails.personId, id),
          inArray(emails.recipient, allowed.inboxes),
        ),
      )
      .limit(1);
    if (match.length === 0) {
      return c.json({ error: "Person not found" }, 404);
    }
  }

  return c.json(rows[0], 200);
});

const deletePersonRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["People"],
  description:
    "Hard delete a person and all their received emails, sent emails, and R2 attachments.",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { description: "Person deleted" },
    403: { description: "Forbidden" },
    404: { description: "Person not found" },
  },
});

peopleRouter.openapi(deletePersonRoute, async (c) => {
  const db = c.get("db");
  const r2 = c.env.R2;
  const { id } = c.req.valid("param");
  const allowed = c.get("allowedInboxes")!;

  if (!allowed.isAdmin) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const person = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.id, id))
    .limit(1);

  if (person.length === 0) {
    return c.json({ error: "Person not found" }, 404);
  }

  // Delete R2 attachments for all received emails belonging to this person
  const atts = await db
    .select({ r2Key: attachments.r2Key })
    .from(attachments)
    .innerJoin(emails, eq(attachments.emailId, emails.id))
    .where(eq(emails.personId, id));

  for (const att of atts) {
    await r2.delete(att.r2Key);
  }

  await db
    .delete(attachments)
    .where(
      inArray(
        attachments.emailId,
        db
          .select({ id: emails.id })
          .from(emails)
          .where(eq(emails.personId, id)),
      ),
    );
  await db.delete(emails).where(eq(emails.personId, id));
  await db.delete(sentEmails).where(eq(sentEmails.personId, id));
  await db.delete(people).where(eq(people.id, id));

  return c.json({ success: true }, 200);
});

// Bulk mark all unread emails as read for one or more people. Optionally
// scope to a specific inbox (e.g. mark only `support@` traffic as read).
const bulkMarkReadRoute = createRoute({
  method: "post",
  path: "/mark-read",
  tags: ["People"],
  description: "Mark every unread email for the given people as read.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            personIds: z.array(z.string()).min(1),
            recipient: z.string().optional().openapi({
              description:
                "Optional: scope the mark-read to one inbox address.",
            }),
          }),
        },
      },
    },
  },
  responses: {
    ...json200Response(
      z.object({
        success: z.boolean(),
        affected: z.number(),
      }),
      "Marked unread emails as read",
    ),
  },
});

peopleRouter.openapi(bulkMarkReadRoute, async (c) => {
  const db = c.get("db");
  const { personIds, recipient } = c.req.valid("json");
  const allowed = c.get("allowedInboxes")!;

  if (personIds.length === 0) {
    return c.json({ success: true, affected: 0 }, 200);
  }

  // Build the recipient scope (admin sees all; member is gated by permitted
  // inboxes; explicit `recipient` narrows further).
  const recipientScope = (() => {
    if (recipient) {
      if (!allowed.isAdmin && !allowed.inboxes.includes(recipient)) {
        return null; // not permitted
      }
      return [recipient];
    }
    if (allowed.isAdmin) return null; // no scope needed
    if (allowed.inboxes.length === 0) return [];
    return allowed.inboxes;
  })();

  if (recipientScope && recipientScope.length === 0) {
    return c.json({ success: true, affected: 0 }, 200);
  }

  // Update emails. We compute the affected count via a SELECT first so we
  // can return a useful number to the UI.
  const conditions = [
    inArray(emails.personId, personIds),
    eq(emails.isRead, 0),
  ];
  if (recipientScope) {
    conditions.push(inArray(emails.recipient, recipientScope));
  }
  const where = and(...conditions)!;

  const affectedRows = await db
    .select({ id: emails.id, personId: emails.personId })
    .from(emails)
    .where(where);
  const affected = affectedRows.length;

  if (affected > 0) {
    await db.update(emails).set({ isRead: 1 }).where(where);

    // Recompute unread_count for each touched person from source-of-truth.
    const touchedPersonIds = Array.from(
      new Set(affectedRows.map((r) => r.personId).filter(Boolean) as string[]),
    );
    for (const pid of touchedPersonIds) {
      const [row] = await db.all<{ count: number }>(sql`
        SELECT COUNT(*) AS count FROM ${emails}
        WHERE person_id = ${pid} AND is_read = 0
      `);
      await db
        .update(people)
        .set({ unreadCount: row?.count ?? 0 })
        .where(eq(people.id, pid));
    }
  }

  return c.json({ success: true, affected }, 200);
});
