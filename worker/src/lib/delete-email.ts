import { eq, sql } from "drizzle-orm";
import { emails } from "../db/emails.schema";
import { sentEmails } from "../db/sent-emails.schema";
import { attachments } from "../db/attachments.schema";
import { people } from "../db/people.schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

/**
 * Hard delete an email (received or sent) and all associated R2 attachments.
 * Updates person counts when deleting a received email.
 * Returns null if the email was not found.
 */
export async function deleteEmailWithAttachments(
  db: DrizzleD1Database<any>,
  r2: R2Bucket,
  emailId: string,
): Promise<{ success: boolean; attachmentsDeleted: number } | null> {
  // Try received email first
  const received = await db
    .select({
      id: emails.id,
      personId: emails.personId,
      isRead: emails.isRead,
    })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  if (received.length > 0) {
    const email = received[0];

    // Delete R2 attachments
    const atts = await db
      .select({ r2Key: attachments.r2Key })
      .from(attachments)
      .where(eq(attachments.emailId, emailId));

    await Promise.all(atts.map((att) => r2.delete(att.r2Key)));

    // Delete attachment DB records
    await db.delete(attachments).where(eq(attachments.emailId, emailId));

    // Delete the email
    await db.delete(emails).where(eq(emails.id, emailId));

    // Update person counts
    const unreadDelta = email.isRead === 0 ? -1 : 0;
    await db
      .update(people)
      .set({
        totalCount: sql`MAX(${people.totalCount} - 1, 0)`,
        ...(unreadDelta
          ? { unreadCount: sql`MAX(${people.unreadCount} - 1, 0)` }
          : {}),
      })
      .where(eq(people.id, email.personId));

    return { success: true, attachmentsDeleted: atts.length };
  }

  // Try sent email
  const sent = await db
    .select({ id: sentEmails.id })
    .from(sentEmails)
    .where(eq(sentEmails.id, emailId))
    .limit(1);

  if (sent.length > 0) {
    // Delete R2 objects and DB records for sent attachments
    const sentAtts = await db
      .select({ r2Key: attachments.r2Key })
      .from(attachments)
      .where(eq(attachments.sentEmailId, emailId));

    await Promise.all(sentAtts.map((att) => r2.delete(att.r2Key)));

    await db.delete(attachments).where(eq(attachments.sentEmailId, emailId));
    await db.delete(sentEmails).where(eq(sentEmails.id, emailId));

    return { success: true, attachmentsDeleted: sentAtts.length };
  }

  return null;
}
