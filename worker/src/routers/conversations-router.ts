import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, sql, inArray } from "drizzle-orm";
import { emails } from "../db/emails.schema";
import { sentEmails } from "../db/sent-emails.schema";
import { attachments } from "../db/attachments.schema";
import { people } from "../db/people.schema";
import { json200Response } from "../lib/helpers";
import { EmailSchema, parseCc } from "./emails-router";
import type { Variables } from "../variables";

export const conversationsRouter = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: Variables;
}>();

const ParticipantSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});

const ConversationEmailsResponseSchema = z.object({
  conversation: z.object({
    id: z.string(),
    inbox: z.string(),
    participants: z.array(ParticipantSchema),
  }),
  emails: z.array(EmailSchema),
});

// GET /api/conversations/{id}/emails — full timeline for a group conversation.
const listConversationEmailsRoute = createRoute({
  method: "get",
  path: "/{id}/emails",
  tags: ["Conversations"],
  description:
    "List all emails in a group conversation, oldest first, with participants metadata.",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    ...json200Response(
      ConversationEmailsResponseSchema,
      "Conversation timeline",
    ),
  },
});

conversationsRouter.openapi(listConversationEmailsRoute, async (c) => {
  const db = c.get("db");
  const { id } = c.req.valid("param");
  const allowed = c.get("allowedInboxes")!;

  // Pull all received + sent emails for this conversation.
  const received = await db
    .select({
      id: emails.id,
      personId: emails.personId,
      recipient: emails.recipient,
      subject: emails.subject,
      bodyHtml: emails.bodyHtml,
      bodyText: emails.bodyText,
      isRead: emails.isRead,
      cc: emails.cc,
      timestamp: emails.receivedAt,
    })
    .from(emails)
    .where(eq(emails.conversationId, id));

  const sent = await db
    .select({
      id: sentEmails.id,
      personId: sentEmails.personId,
      fromAddress: sentEmails.fromAddress,
      toAddress: sentEmails.toAddress,
      subject: sentEmails.subject,
      bodyHtml: sentEmails.bodyHtml,
      bodyText: sentEmails.bodyText,
      cc: sentEmails.cc,
      timestamp: sentEmails.sentAt,
    })
    .from(sentEmails)
    .where(eq(sentEmails.conversationId, id));

  if (received.length === 0 && sent.length === 0) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Scope check: at least one email in this conversation must reference an
  // inbox the caller is allowed to see. Admin sees everything.
  if (!allowed.isAdmin) {
    const allowedSet = new Set(allowed.inboxes);
    const inScope =
      received.some((e) => allowedSet.has(e.recipient)) ||
      sent.some((e) => allowedSet.has(e.fromAddress));
    if (!inScope) {
      return c.json({ error: "Conversation not found" }, 404);
    }
  }

  // Resolve the canonical inbox for the conversation. The seed model treats
  // the (conversation_id, inbox) tuple as the group key, so we pick the inbox
  // tied to the most recent email (mirroring the grouped list endpoint).
  const allRows = [
    ...received.map((e) => ({ inbox: e.recipient, ts: e.timestamp })),
    ...sent.map((e) => ({ inbox: e.fromAddress, ts: e.timestamp })),
  ];
  allRows.sort((a, b) => b.ts - a.ts);
  const inbox = allRows[0]?.inbox ?? "";

  // Build participants list (senders who posted into this thread).
  const personIds = new Set<string>();
  for (const e of received) if (e.personId) personIds.add(e.personId);
  for (const e of sent) if (e.personId) personIds.add(e.personId);
  const participants =
    personIds.size > 0
      ? await db
          .select({
            id: people.id,
            email: people.email,
            name: people.name,
          })
          .from(people)
          .where(inArray(people.id, Array.from(personIds)))
      : [];

  // Build attachment lookup for received emails — same treatment as
  // listPersonEmails so the response shape stays consistent.
  const receivedIds = received.map((e) => e.id);
  let attachmentCounts: Record<string, number> = {};
  let attachmentDetails: Record<string, any[]> = {};
  if (receivedIds.length > 0) {
    const counts = await db
      .select({
        emailId: attachments.emailId,
        count: sql<number>`COUNT(*)`,
      })
      .from(attachments)
      .where(
        sql`${attachments.emailId} IN (${sql.join(
          receivedIds.map((rid) => sql`${rid}`),
          sql`,`,
        )})`,
      )
      .groupBy(attachments.emailId);
    for (const row of counts) {
      attachmentCounts[row.emailId] = row.count;
    }
    const attRows = await db
      .select()
      .from(attachments)
      .where(
        sql`${attachments.emailId} IN (${sql.join(
          receivedIds.map((rid) => sql`${rid}`),
          sql`,`,
        )})`,
      );
    for (const att of attRows) {
      if (!attachmentDetails[att.emailId]) {
        attachmentDetails[att.emailId] = [];
      }
      attachmentDetails[att.emailId].push(att);
    }
  }

  // Merge into the same email shape as listPersonEmailsRoute, oldest first.
  const merged = [
    ...received.map((e) => ({
      id: e.id,
      type: "received" as const,
      personId: e.personId ?? null,
      recipient: e.recipient,
      fromAddress: null,
      toAddress: null,
      subject: e.subject,
      bodyHtml: e.bodyHtml,
      bodyText: e.bodyText,
      isRead: e.isRead,
      cc: parseCc(e.cc),
      timestamp: e.timestamp,
      attachmentCount: attachmentCounts[e.id] ?? 0,
      attachments: attachmentDetails[e.id] ?? [],
    })),
    ...sent.map((e) => ({
      id: e.id,
      type: "sent" as const,
      personId: e.personId ?? null,
      recipient: null,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      subject: e.subject,
      bodyHtml: e.bodyHtml,
      bodyText: e.bodyText,
      isRead: null,
      cc: parseCc(e.cc),
      timestamp: e.timestamp,
      attachmentCount: 0,
      attachments: [],
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  return c.json(
    {
      conversation: {
        id,
        inbox,
        participants,
      },
      emails: merged,
    },
    200,
  );
});
