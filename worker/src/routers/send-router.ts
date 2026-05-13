import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import { createEmailSender } from "../lib/email-sender";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} from "../lib/attachment-limits";
import type { EmailAttachment } from "../lib/email-sender";
import { sentEmails } from "../db/sent-emails.schema";
import { attachments } from "../db/attachments.schema";
import { people } from "../db/people.schema";
import { emails } from "../db/emails.schema";
import { senderIdentities } from "../db/sender-identities.schema";
import { json201Response } from "../lib/helpers";
import { cancelSequencesForPerson } from "../lib/cancel-sequence";
import { emailTemplates } from "../db/email-templates.schema";
import { interpolate, extractVariables } from "../lib/interpolate";
import type { Variables } from "../variables";
import { formatFromAddress } from "../lib/format-from-address";
import { assertInboxAllowed } from "../lib/inbox-permissions";
import { generateMessageId } from "../lib/message-id";
import { computeConversationId, externalsOnly } from "../lib/conversation-id";

async function fetchInternalDomains(
  db: ReturnType<typeof OpenAPIHono.prototype.notFound> extends never
    ? unknown
    : unknown,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any)
    .select({ email: senderIdentities.email })
    .from(senderIdentities);
  return Array.from(
    new Set(
      rows
        .map((r: { email: string }) => {
          const at = r.email.lastIndexOf("@");
          return at === -1 ? "" : r.email.slice(at + 1).toLowerCase();
        })
        .filter(Boolean),
    ),
  ) as string[];
}

export const sendRouter = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: Variables;
}>();

const CcEntrySchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).nullable().optional(),
});
type CcEntry = z.infer<typeof CcEntrySchema>;

const MAX_CC_ENTRIES = 50;

function formatCc(c: CcEntry): string {
  return c.name ? `${c.name} <${c.email}>` : c.email;
}

const SendEmailSchema = z.object({
  to: z.string().email(),
  fromAddress: z.string().email(),
  cc: z.array(CcEntrySchema).max(MAX_CC_ENTRIES).optional(),
  subject: z.string().transform((s) => s.replace(/[\r\n]+/g, " ")),
  bodyHtml: z.string(),
  bodyText: z.string().optional(),
});

const SentEmailResponseSchema = z.object({
  id: z.string(),
  resendId: z.string().nullable(),
  status: z.string(),
});

function extractFiles(body: Record<string, unknown>): {
  files: File[];
  error: string | null;
} {
  const raw = body["attachments"];
  const files: File[] = raw
    ? (Array.isArray(raw) ? raw : [raw]).filter(
        (f): f is File => f instanceof File,
      )
    : [];
  if (files.length > MAX_ATTACHMENTS) {
    return {
      files: [],
      error: `Too many attachments (max ${MAX_ATTACHMENTS})`,
    };
  }
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_ATTACHMENT_BYTES) {
    return { files: [], error: "Attachments exceed 25 MB limit" };
  }
  return { files, error: null };
}

async function filesToAttachments(files: File[]): Promise<EmailAttachment[]> {
  return Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      contentType: f.type || "application/octet-stream",
      data: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

type Db = ReturnType<typeof drizzle>;

async function storeSentAttachments(
  db: Db,
  r2: R2Bucket,
  sentEmailId: string,
  files: File[],
  attachmentData: EmailAttachment[],
  now: number,
): Promise<void> {
  if (files.length === 0) return;

  const entries = files.map((file, i) => {
    const attId = nanoid();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `sent-attachments/${sentEmailId}/${attId}/${safeFilename}`;
    return { attId, safeFilename, r2Key, file, data: attachmentData[i]! };
  });

  const uploadedKeys: string[] = [];

  try {
    await Promise.all(
      entries.map(async (e) => {
        await r2.put(e.r2Key, e.data.data, {
          httpMetadata: { contentType: e.data.contentType },
        });
        uploadedKeys.push(e.r2Key);
      }),
    );

    await db.insert(attachments).values(
      entries.map((e) => ({
        id: e.attId,
        sentEmailId,
        emailId: null,
        contentId: null,
        filename: e.safeFilename,
        contentType: e.data.contentType,
        size: e.file.size,
        r2Key: e.r2Key,
        createdAt: now,
      })),
    );
  } catch (err) {
    await Promise.allSettled(uploadedKeys.map((key) => r2.delete(key)));
    throw err;
  }
}

// Compose and send a new email
const sendEmailRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Send"],
  description: "Compose and send a new email via Resend.",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: SendEmailSchema,
        },
      },
    },
  },
  responses: {
    ...json201Response(SentEmailResponseSchema, "Email sent"),
  },
});

sendRouter.openapi(sendEmailRoute, async (c) => {
  const db = c.get("db");
  const body = await c.req.parseBody({ all: true });

  let parsed: z.infer<typeof SendEmailSchema>;
  try {
    parsed = SendEmailSchema.parse({
      to: body.to,
      fromAddress: body.fromAddress,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      bodyText: body.bodyText || undefined,
    });
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }

  // Canonicalize inbox + recipient addresses to lowercase before
  // any downstream use — keeps stored rows consistent with the
  // (already-lowercased) conversation_id and prevents casing
  // variants from forking group rows. CC emails get the same
  // treatment so de-dup and roster diff work case-insensitively.
  const fromAddress = parsed.fromAddress.trim().toLowerCase();
  const to = parsed.to.trim().toLowerCase();
  const cc = parsed.cc?.map((c) => ({
    email: c.email.trim().toLowerCase(),
    name: c.name ?? null,
  }));
  const { subject, bodyHtml, bodyText } = parsed;

  const allowed = c.get("allowedInboxes")!;
  assertInboxAllowed(allowed, fromAddress);

  const { files, error: attachErr } = extractFiles(
    body as Record<string, unknown>,
  );
  if (attachErr) return c.json({ error: attachErr }, 400);

  const now = Math.floor(Date.now() / 1000);
  const emailAttachments = await filesToAttachments(files);

  const messageId = generateMessageId(fromAddress);
  const sender = createEmailSender(c.env);
  const formattedFrom = await formatFromAddress(db, fromAddress);
  const result = await sender.send({
    from: formattedFrom,
    to,
    ...(cc && cc.length > 0 ? { cc: cc.map(formatCc) } : {}),
    subject,
    html: bodyHtml,
    text: bodyText,
    headers: { "Message-ID": messageId },
    attachments: emailAttachments,
  });

  // Find or create the person row for this recipient.
  const existingPerson = await db
    .select({ id: people.id })
    .from(people)
    .where(eq(people.email, to))
    .limit(1);

  let personId: string;
  if (existingPerson[0]) {
    personId = existingPerson[0].id;
  } else {
    personId = nanoid();
    await db
      .insert(people)
      .values({
        id: personId,
        email: to,
        name: null,
        lastEmailAt: now,
        unreadCount: 0,
        totalCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: people.email });
    const refetched = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, to))
      .limit(1);
    personId = refetched[0]!.id;
  }

  const internalDomains = await fetchInternalDomains(db);
  const externals = externalsOnly(
    [to, ...(cc ?? []).map((c) => c.email)],
    internalDomains,
  );
  const conversationId = await computeConversationId(fromAddress, externals);

  // Store sent email
  const id = nanoid();
  await db.insert(sentEmails).values({
    id,
    personId,
    fromAddress,
    toAddress: to,
    subject,
    bodyHtml,
    bodyText: bodyText ?? null,
    messageId,
    resendId: result.id,
    status: result.error ? "failed" : "sent",
    cc: cc && cc.length > 0 ? JSON.stringify(cc) : null,
    conversationId,
    sentAt: now,
    createdAt: now,
  });

  await storeSentAttachments(db, c.env.R2, id, files, emailAttachments, now);

  // Cancel any active sequences for this recipient
  await cancelSequencesForPerson(db, personId);

  return c.json(
    {
      id,
      resendId: result.id,
      status: result.error ? "failed" : "sent",
    },
    201,
  );
});

// Reply to an existing email
const replyEmailRoute = createRoute({
  method: "post",
  path: "/reply/{emailId}",
  tags: ["Send"],
  description: "Reply to a received email.",
  request: {
    params: z.object({ emailId: z.string() }),
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            bodyHtml: z.string().optional(),
            bodyText: z.string().optional(),
            fromAddress: z.string().email(),
            cc: z.array(CcEntrySchema).max(MAX_CC_ENTRIES).optional(),
            templateSlug: z.string().optional(),
            variables: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    ...json201Response(SentEmailResponseSchema, "Reply sent"),
  },
});

sendRouter.openapi(replyEmailRoute, async (c) => {
  const db = c.get("db");
  const { emailId } = c.req.valid("param");
  const body = await c.req.parseBody({ all: true });

  const rawFromAddress = String(body.fromAddress ?? "");
  if (!rawFromAddress || !/\S+@\S+/.test(rawFromAddress)) {
    return c.json({ error: "Invalid fromAddress" }, 400);
  }

  const bodyHtml = body.bodyHtml ? String(body.bodyHtml) : undefined;
  const bodyText = body.bodyText ? String(body.bodyText) : undefined;
  const templateSlug = body.templateSlug
    ? String(body.templateSlug)
    : undefined;
  let variables: Record<string, string> = {};
  if (body.variables && typeof body.variables === "string") {
    try {
      variables = JSON.parse(body.variables);
    } catch {
      return c.json({ error: "Invalid variables JSON" }, 400);
    }
  }

  let cc: { email: string; name: string | null }[] | undefined;
  if (body.cc && typeof body.cc === "string") {
    try {
      cc = JSON.parse(body.cc as string);
    } catch {
      return c.json({ error: "Invalid cc JSON" }, 400);
    }
  }
  // Canonicalize CC addresses
  cc = cc?.map((c) => ({
    email: c.email.trim().toLowerCase(),
    name: c.name ?? null,
  }));

  // Same canonicalization story as the send route — lowercase the
  // inbox + recipient + CC emails before downstream use so stored
  // rows match the lowercased conversation_id.
  const fromAddress = rawFromAddress.trim().toLowerCase();
  const allowed = c.get("allowedInboxes")!;
  assertInboxAllowed(allowed, fromAddress);
  const now = Math.floor(Date.now() / 1000);

  const { files, error: attachErr } = extractFiles(
    body as Record<string, unknown>,
  );
  if (attachErr) return c.json({ error: attachErr }, 400);

  // Resolve the original across both received and sent tables.
  const receivedRow = await db
    .select()
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  let origPersonId: string;
  let origSubject: string | null;
  let origInReplyToMessageId: string | null;
  let toAddress: string;

  if (receivedRow.length > 0) {
    const orig = receivedRow[0];
    const person = await db
      .select({ email: people.email })
      .from(people)
      .where(eq(people.id, orig.personId))
      .limit(1);
    if (person.length === 0) {
      return c.json({ error: "Person not found" }, 404);
    }
    origPersonId = orig.personId;
    origSubject = orig.subject ?? null;
    origInReplyToMessageId = orig.messageId ?? null;
    // Canonicalize the recipient — older rows may be mixed-case.
    toAddress = person[0].email.toLowerCase();
  } else {
    const sentRow = await db
      .select()
      .from(sentEmails)
      .where(eq(sentEmails.id, emailId))
      .limit(1);
    if (sentRow.length === 0) {
      return c.json({ error: "Email not found" }, 404);
    }
    const orig = sentRow[0];
    assertInboxAllowed(allowed, orig.fromAddress);
    if (!orig.personId) {
      return c.json({ error: "Email has no associated person" }, 404);
    }
    origPersonId = orig.personId;
    origSubject = orig.subject ?? null;
    origInReplyToMessageId = orig.messageId ?? null;
    toAddress = orig.toAddress.toLowerCase();
  }

  // Determine subject and body
  let finalSubject: string;
  let finalBodyHtml: string;

  if (templateSlug) {
    // Template-based reply
    const templateRows = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.slug, templateSlug))
      .limit(1);

    if (templateRows.length === 0) {
      return c.json({ error: "Template not found" }, 404);
    }

    const template = templateRows[0];

    // Validate required variables
    const subjectVars = extractVariables(template.subject);
    const bodyVars = extractVariables(template.bodyHtml);
    const requiredVars = Array.from(new Set([...subjectVars, ...bodyVars]));
    const missingVars = requiredVars.filter((v) => !(v in variables));

    if (missingVars.length > 0) {
      return c.json(
        {
          error: "Missing required template variables",
          missingVariables: missingVars,
          requiredVariables: requiredVars,
        },
        400,
      );
    }

    finalSubject = interpolate(template.subject, variables);
    finalBodyHtml = interpolate(template.bodyHtml, variables);
  } else if (bodyHtml) {
    // Freeform reply
    finalSubject = origSubject?.startsWith("Re: ")
      ? origSubject
      : `Re: ${origSubject || ""}`;
    finalBodyHtml = bodyHtml;
  } else {
    return c.json(
      { error: "Either bodyHtml or templateSlug is required" },
      400,
    );
  }

  const emailAttachments = await filesToAttachments(files);

  const messageId = generateMessageId(fromAddress);
  const sender = createEmailSender(c.env);
  const formattedFrom = await formatFromAddress(db, fromAddress);
  const result = await sender.send({
    from: formattedFrom,
    to: toAddress,
    ...(cc?.length ? { cc: cc.map(formatCc) } : {}),
    subject: finalSubject,
    html: finalBodyHtml,
    text: bodyText,
    headers: {
      "Message-ID": messageId,
      ...(origInReplyToMessageId
        ? { "In-Reply-To": origInReplyToMessageId }
        : {}),
    },
    attachments: emailAttachments,
  });

  // Compute conversation_id for this reply.
  const internalDomainsReply = await fetchInternalDomains(db);
  const externalsReply = externalsOnly(
    [toAddress, ...(cc ?? []).map((c) => c.email)],
    internalDomainsReply,
  );
  const conversationIdReply = await computeConversationId(
    fromAddress,
    externalsReply,
  );

  // Store sent email
  const id = nanoid();
  await db.insert(sentEmails).values({
    id,
    personId: origPersonId,
    fromAddress,
    toAddress,
    subject: finalSubject,
    bodyHtml: finalBodyHtml,
    bodyText: bodyText ?? null,
    inReplyTo: origInReplyToMessageId,
    messageId,
    resendId: result.id,
    status: result.error ? "failed" : "sent",
    cc: cc && cc.length > 0 ? JSON.stringify(cc) : null,
    conversationId: conversationIdReply,
    sentAt: now,
    createdAt: now,
  });

  await storeSentAttachments(db, c.env.R2, id, files, emailAttachments, now);

  // Cancel any active sequences for this person
  await cancelSequencesForPerson(db, origPersonId);

  return c.json(
    {
      id,
      resendId: result.id,
      status: result.error ? "failed" : "sent",
    },
    201,
  );
});
