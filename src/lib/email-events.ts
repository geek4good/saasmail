/**
 * Custom event fired whenever an outgoing email is successfully sent
 * — from ReplyComposer, ComposeModal, ChatQuickReply, or anywhere
 * else that talks to the send/reply APIs. Subscribers can react to
 * the event without prop-drilling: e.g. PersonDetail listens to
 * auto-switch the active inbox tab to the one the message went out
 * from when that differs from the user's current view.
 *
 * Same custom-event pattern as `lib/signatures.ts` and `lib/toast.ts`
 * — keeps cross-tree wiring zero-dependency.
 */

export const EMAIL_SENT_EVENT = "saasmail:email-sent";

export interface EmailSentDetail {
  /** The inbox the message was sent from. Always set. */
  fromAddress: string;
  /** Optional — the recipient (used for nicer toast copy). */
  to?: string | null;
  /** Where the send happened so listeners can decide whether to act. */
  origin: "compose" | "reply" | "chat-quick-reply";
}

export function dispatchEmailSent(detail: EmailSentDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EMAIL_SENT_EVENT, { detail }));
}

/** Strongly-typed wrapper around addEventListener for the same event. */
export function onEmailSent(
  handler: (detail: EmailSentDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  function listener(e: Event) {
    handler((e as CustomEvent<EmailSentDetail>).detail);
  }
  window.addEventListener(EMAIL_SENT_EVENT, listener);
  return () => window.removeEventListener(EMAIL_SENT_EVENT, listener);
}
