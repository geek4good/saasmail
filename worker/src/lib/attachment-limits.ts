/**
 * Attachment limits enforced by the backend.
 * The frontend mirrors these values in src/hooks/useAttachments.ts.
 */

/** Maximum number of files per outgoing email. */
export const MAX_ATTACHMENTS = 10;

/** Maximum total attachment size per outgoing email, in bytes. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
