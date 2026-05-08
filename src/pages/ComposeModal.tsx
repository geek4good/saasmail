import { useState, useEffect, useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Send, AtSign, PenSquare, Type } from "lucide-react";
import TiptapEditor from "@/components/TiptapEditor";
import CcInput from "@/components/CcInput";
import { sendEmail, fetchStats, type CcEntry } from "@/lib/api";
import { getFromLabel } from "@/lib/format";

/**
 * Optional seed values applied when the compose drawer opens. Used by
 * the chat-mode "open in compose" handoff so a user can switch from
 * the bottom-of-thread quick reply to the full editor without losing
 * context (sender, recipient, CC roster, subject).
 *
 * Any field omitted falls back to the drawer's regular default —
 * `from` defaults to the user's first inbox; `to`/`cc`/`subject`/`bodyHtml`
 * default to empty.
 */
export interface ComposePrefill {
  from?: string;
  to?: string;
  cc?: CcEntry[];
  subject?: string;
  bodyHtml?: string;
}

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  prefill?: ComposePrefill | null;
}

/**
 * Compose drawer — opens from the right edge to match ReplyComposer.
 * Single "Freeform" mode for now (no template support); structurally
 * mirrors the reply experience so the two feel like the same component.
 */
export default function ComposeModal({
  open,
  onClose,
  prefill,
}: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [cc, setCc] = useState<CcEntry[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [senderIdentities, setSenderIdentities] = useState<
    Array<{
      email: string;
      displayName: string | null;
      signatureHtml: string | null;
    }>
  >([]);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  // Tracked separately from the body so swapping `From` mid-compose can swap
  // the signature without stomping on what the user has typed.
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Domains we own — used for the lime/neutral CC chip color.
  const internalDomains = useMemo(() => {
    const set = new Set<string>();
    for (const s of senderIdentities) {
      const at = s.email.lastIndexOf("@");
      if (at >= 0) set.add(s.email.slice(at + 1).toLowerCase());
    }
    return Array.from(set);
  }, [senderIdentities]);

  // TipTap emits "<p></p>" for an empty editor — treat that as empty.
  const bodyIsEmpty = !bodyHtml || bodyHtml === "<p></p>";

  useEffect(() => {
    if (open) {
      fetchStats().then((stats) => {
        setRecipients(stats.recipients);
        setSenderIdentities(stats.senderIdentities ?? []);
        // Prefill `from` wins; otherwise keep whatever was sticky from
        // last open; finally fall back to the first inbox.
        const want = prefill?.from;
        if (want && stats.recipients.includes(want)) {
          setFromAddress(want);
        } else if (!fromAddress && stats.recipients.length > 0) {
          setFromAddress(stats.recipients[0]);
        }
      });
      // Apply any seeded values up front. Fields the caller didn't
      // specify stay empty — same as a fresh "Compose" click.
      setTo(prefill?.to ?? "");
      setCc(prefill?.cc ?? []);
      setSubject(prefill?.subject ?? "");
      setBodyHtml(prefill?.bodyHtml ?? "");
    } else {
      setTo("");
      setCc([]);
      setSubject("");
      setBodyHtml("");
      setSignatureHtml(null);
      setError("");
    }
    // We intentionally don't track `fromAddress` here — it's only used
    // as a sticky fallback above, not as a trigger to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  // Whenever the From inbox or the loaded identity list changes, swap the
  // signature trail to match. Stays a separate state slot so the user's
  // typed body never gets clobbered.
  useEffect(() => {
    if (!fromAddress) {
      setSignatureHtml(null);
      return;
    }
    const match = senderIdentities.find((s) => s.email === fromAddress);
    setSignatureHtml(match?.signatureHtml ?? null);
  }, [fromAddress, senderIdentities]);

  async function handleSend() {
    if (!to || bodyIsEmpty) return;
    setSending(true);
    setError("");
    try {
      // Concatenate the typed body + auto-attached signature on send.
      // The signature is wrapped in `data-signature` so the chat-feed
      // toggle can strip it back out cleanly.
      const finalBody = signatureHtml
        ? `${bodyHtml}<div data-signature>${signatureHtml}</div>`
        : bodyHtml;
      await sendEmail({
        to,
        fromAddress,
        ...(cc.length > 0 ? { cc } : {}),
        subject,
        bodyHtml: finalBody,
      });
      onClose();
    } catch {
      setError("Failed to send email");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!open) return null;

  return (
    // Non-modal tray (Gmail-style): the inbox stays clickable behind the
    // compose window, only the close button or Esc dismisses, and the
    // tray is anchored to the bottom-right.
    <DialogPrimitive.Root
      open
      modal={false}
      onOpenChange={(v) => !v && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tray-overlay fixed inset-0 z-50" />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="tray-content fixed bottom-0 right-0 z-50 flex h-[90vh] w-full flex-col rounded-t-[14px] bg-card shadow-[0_24px_60px_-15px_rgba(15,23,42,0.35)] ring-1 ring-border focus:outline-none sm:right-6 sm:h-[640px] sm:max-h-[calc(100vh-2rem)] sm:w-[640px]"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-border bg-card px-6 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: "rgba(124, 92, 252, 0.12)",
                    color: "#5b3ce6",
                  }}
                >
                  <PenSquare size={18} />
                </span>
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-lg font-extrabold tracking-tight text-text-primary">
                    Compose
                  </DialogPrimitive.Title>
                  <p className="mt-0.5 truncate text-sm font-light text-text-tertiary">
                    Send a new email from one of your inboxes
                  </p>
                </div>
              </div>
              <DialogPrimitive.Close
                className="shrink-0 rounded-[8px] p-1.5 text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary"
                aria-label="Close"
              >
                <X size={18} />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Metadata: From / To / Subject */}
          <div className="shrink-0 space-y-1 border-b border-border bg-bg-subtle/40 px-6 py-3">
            <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                <AtSign size={11} />
                From
              </span>
              <select
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                required
                className="rounded-[6px] border border-border bg-card px-2 py-1.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-text-primary/15"
              >
                {recipients.map((r) => (
                  <option key={r} value={r}>
                    {getFromLabel(r, senderIdentities)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-1">
              <label
                htmlFor="compose-to"
                className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary"
              >
                <Send size={11} />
                To
              </label>
              <input
                id="compose-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
                placeholder="recipient@example.com"
                aria-label="To"
                className="rounded-[6px] border border-border bg-card px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-text-primary/15"
              />
            </div>
            <div className="grid grid-cols-[60px_1fr] items-start gap-3 py-1">
              <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Cc
              </span>
              <CcInput
                value={cc}
                onChange={setCc}
                internalDomains={internalDomains}
                testId="compose-cc-input"
              />
            </div>
            <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-1">
              <label
                htmlFor="compose-subject"
                className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary"
              >
                <Type size={11} />
                Subject
              </label>
              <input
                id="compose-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="What's it about?"
                aria-label="Subject"
                className="rounded-[6px] border border-border bg-card px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:ring-2 focus:ring-text-primary/15"
              />
            </div>
          </div>

          {/* Body */}
          <div
            className="smooth-scroll min-h-0 flex-1 overflow-y-auto bg-card"
            data-testid="compose-body"
          >
            <div className="flex h-full min-h-[320px] flex-col p-6">
              <TiptapEditor content={bodyHtml} onUpdate={setBodyHtml} />
              {signatureHtml && (
                <div
                  data-signature
                  data-testid="compose-signature-preview"
                  className="mt-4 border-t border-border/60 pt-3 opacity-70"
                  // Read-only signature preview. Auto-attached at send time;
                  // edited via the admin Inboxes page rather than inline.
                  dangerouslySetInnerHTML={{ __html: signatureHtml }}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-card px-6 py-3">
            {error && (
              <p className="mb-2 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="hidden text-[11px] font-light text-text-tertiary sm:block">
                <kbd className="rounded border border-border bg-bg-muted px-1 font-mono text-[10px]">
                  ⌘
                </kbd>
                <kbd className="ml-1 rounded border border-border bg-bg-muted px-1 font-mono text-[10px]">
                  Enter
                </kbd>
                <span className="ml-1.5">to send</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[6px] border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="compose-send-button"
                  onClick={handleSend}
                  disabled={sending || bodyIsEmpty || !to}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-text-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={12} />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
