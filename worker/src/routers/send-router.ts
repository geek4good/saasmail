import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import { createEmailSender } from "../lib/email-sender";
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "../lib/attachment-limits";
import type { EmailAttachment } from "../lib/email-sender";
import { sentEmails } from "../db/sent-emails.schema";
import { attachments } from "../db/attachments.schema";
import { people } from "../db/people.schema";
import { emails } from "../db/emails.schema";
import { json201Response } from "../lib/helpers";
import { cancelSequencesForPerson } from "../lib/cancel-sequence";
import { emailTemplates } from "../db/email-templates.schema";
import { interpolate, extractVariables } from "../lib/interpolate";
import type { Variables } from "../variables";
import { formatFromAddress } from "../lib/format-from-address";
import { assertInboxAllowed } from "../lib/inbox-permissions";
import { generateMessageId } from "../lib/message-id";

export const sendRouter = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: Variables;
}>();

const SendEmailSchema = z.object({
  to: z.string().email(),
  fromAddress: z.string().email(),
  subject: z.string().transform((s) => s.replace(/[\r\n]+/g, " ")),
  bodyHtml: z.string(),
  bodyText: z.string().optional(),
});

const SentEmailResponseSchema = z.object({
  id: z.string(),
  resendId: z.string().nullable(),
  status: z.string(),
});

function extractFiles(body: Record<string, unknown>): { files: File[]; error: string | null } {
  const raw = body["attachments"];
  const files: File[] = raw
    ? (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => f instanceof File)
    : [];
  if (files.length > MAX_ATTACHMENTS) {
    return { files: [], error: `Too many attachments (max ${MAX_ATTACHMENTS})` };
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
  const entries = files.map((file, i) => {
    const attId = nanoid();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `sent-attachments/${sentEmailId}/${attId}/${safeFilename}`;
    return { attId, safeFilename, r2Key, file, data: attachmentData[i]! };
  });

  await Promise.all(
    entries.map((e) =>
      r2.put(e.r2Key, e.data.data, {
        httpMetadata: { contentType: e.data.contentType },
      }),
    ),
  );

  if (entries.length > 0) {
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

  const { to, fromAddress, subject, bodyHtml, bodyText } = parsed;
  const allowed = c.get("allowedInboxes")!;
  assertInboxAllowed(allowed, fromAddress);

  const { files, error: attachErr } = extractFiles(body as Record<string, unknown>);
  if (attachErr) return c.json({ error: attachErr }, 400);

  const now = Math.floor(Date.now() / 1000);
  const attachments = await filesToAttachments(files);

  const messageId = generateMessageId(fromAddress);
  const sender = createEmailSender(c.env);
  const formattedFrom = await formatFromAddress(db, fromAddress);
  const result = await sender.send({
    from: formattedFrom,
    to,
    subject,
    html: bodyHtml,
    text: bodyText,
    headers: { "Message-ID": messageId },
    attachments,
  });

  // Find or create the person row for this recipient. Composing to a brand-new
  // address must register them as a correspondent so they show up in the
  // people list (which is keyed on people.id).
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
    // Re-read in case of a race with another insert.
    const refetched = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.email, to))
      .limit(1);
    personId = refetched[0]!.id;
  }

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
    sentAt: now,
    createdAt: now,
  });

  await storeSentAttachments(db, c.env.R2, id, files, attachments, now);

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

  const fromAddress = String(body.fromAddress ?? "");
  const bodyHtml = body.bodyHtml ? String(body.bodyHtml) : undefined;
  const bodyText = body.bodyText ? String(body.bodyText) : undefined;
  const templateSlug = body.templateSlug ? String(body.templateSlug) : undefined;
  let variables: Record<string, string> = {};
  if (body.variables && typeof body.variables === "string") {
    try {
      variables = JSON.parse(body.variables);
    } catch {
      return c.json({ error: "Invalid variables JSON" }, 400);
    }
  }

  const allowed = c.get("allowedInboxes")!;
  assertInboxAllowed(allowed, fromAddress);
  const now = Math.floor(Date.now() / 1000);

  const { files, error: attachErr } = extractFiles(body as Record<string, unknown>);
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
    toAddress = person[0].email;
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
    // Defense-in-depth: only allow replies to sent rows whose original
    // fromAddress the caller still owns. Prevents a user from threading a
    // reply to another user's outgoing message via its id.
    assertInboxAllowed(allowed, orig.fromAddress);
    if (!orig.personId) {
      return c.json({ error: "Email has no associated person" }, 404);
    }
    origPersonId = orig.personId;
    origSubject = orig.subject ?? null;
    origInReplyToMessageId = orig.messageId ?? null;
    toAddress = orig.toAddress;
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

  const attachments = await filesToAttachments(files);

  const messageId = generateMessageId(fromAddress);
  const sender = createEmailSender(c.env);
  const formattedFrom = await formatFromAddress(db, fromAddress);
  const result = await sender.send({
    from: formattedFrom,
    to: toAddress,
    subject: finalSubject,
    html: finalBodyHtml,
    text: bodyText,
    headers: {
      "Message-ID": messageId,
      ...(origInReplyToMessageId
        ? { "In-Reply-To": origInReplyToMessageId }
        : {}),
    },
    attachments,
  });

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
    sentAt: now,
    createdAt: now,
  });

  await storeSentAttachments(db, c.env.R2, id, files, attachments, now);

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
