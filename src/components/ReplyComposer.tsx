import { useState, useEffect, useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Send,
  AtSign,
  Reply as ReplyIcon,
  FileText,
  Sparkles,
  Inbox as InboxIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import TiptapEditor from "@/components/TiptapEditor";
import CcInput from "@/components/CcInput";
import {
  replyToEmail,
  fetchTemplates,
  fetchEmail,
  fetchPersonEmails,
  type EmailTemplate,
  type Email,
  type CcEntry,
} from "@/lib/api";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";
import { getFromLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ReplyComposerProps {
  emailId: string;
  personName: string | null;
  personEmail: string;
  recipients: string[];
  senderIdentities: Array<{
    email: string;
    displayName: string | null;
    signatureHtml?: string | null;
  }>;
  /** Domains we treat as "internal" — used for CC chip color. */
  internalDomains?: string[];
  onClose: () => void;
  onSent: () => void;
}

type Tab = "freeform" | "template";

function extractVariables(subject: string, bodyHtml: string): string[] {
  const vars = new Set<string>();
  const regex = /\{\{(\w+)\}\}/g;
  for (const src of [subject, bodyHtml]) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(src)) !== null) {
      vars.add(m[1]);
    }
  }
  return Array.from(vars);
}

export default function ReplyComposer({
  emailId,
  personName,
  personEmail,
  recipients,
  senderIdentities,
  internalDomains = [],
  onClose,
  onSent,
}: ReplyComposerProps) {
  const [tab, setTab] = useState<Tab>("freeform");
  const [fromAddress, setFromAddress] = useState(recipients[0] ?? "");
  const [cc, setCc] = useState<CcEntry[]>([]);
  const [bodyHtml, setBodyHtml] = useState("");
  // Stored separately from the body so swapping `From` mid-reply replaces
  // the trailing signature without touching what the user has typed.
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Sync the signature trail to the active From inbox.
  useEffect(() => {
    if (!fromAddress) {
      setSignatureHtml(null);
      return;
    }
    const match = senderIdentities.find((s) => s.email === fromAddress);
    setSignatureHtml(match?.signatureHtml ?? null);
  }, [fromAddress, senderIdentities]);

  // Thread context — the email being replied to + prior messages from the
  // same person/inbox so the user can reference them while drafting.
  const [originalEmail, setOriginalEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [threadExpanded, setThreadExpanded] = useState(false);
  // Surface failure to load the original. The previous silent `.catch`
  // masked a real bug — the server didn't look up sent_emails, so
  // clicking Reply on our own outgoing message rendered an empty
  // composer with no warning.
  const [contextError, setContextError] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");

  // Load the email being replied to + the surrounding thread on mount.
  // Pre-populate CC from the original message so "reply-all" semantics
  // are the default — users can still trim chips before sending.
  useEffect(() => {
    let cancelled = false;
    setContextError(false);
    fetchEmail(emailId)
      .then(async (email) => {
        if (cancelled) return;
        setOriginalEmail(email);
        if (email.cc && email.cc.length > 0) {
          // Drop our own inbox addresses from the suggested CC list — we
          // don't want to CC ourselves on a reply we're sending.
          const ours = new Set(recipients.map((r) => r.toLowerCase()));
          setCc(email.cc.filter((c) => !ours.has(c.email.toLowerCase())));
        }
        // If we have a personId, fetch the person's recent emails in this inbox.
        if (email.personId) {
          try {
            const recipient = email.recipient ?? email.fromAddress ?? undefined;
            const res = await fetchPersonEmails(email.personId, {
              recipient,
              limit: 12,
            });
            if (!cancelled) setThreadEmails(res.emails);
          } catch (err) {
            // Surface to console so a future regression isn't invisible.
            console.warn("Failed to load surrounding thread", err);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // The composer still works — the user can type and send. But
        // they'd have no idea why the "what you're replying to" panel
        // is missing without this notice.
        console.warn("Failed to load reply context", err);
        setContextError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [emailId, recipients]);

  const selectedTemplate =
    templates.find((t) => t.slug === selectedSlug) ?? null;

  const requiredVars = useMemo(() => {
    if (!selectedTemplate) return [];
    return extractVariables(
      selectedTemplate.subject,
      selectedTemplate.bodyHtml,
    );
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const vars: Record<string, string> = {};
    for (const v of requiredVars) {
      if (v.toLowerCase() === "name" && personName) vars[v] = personName;
      else if (v.toLowerCase() === "email") vars[v] = personEmail;
      else vars[v] = templateVars[v] ?? "";
    }
    setTemplateVars(vars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug, requiredVars.join(",")]);

  useEffect(() => {
    if (tab !== "template" || templates.length > 0) return;
    setTemplatesLoading(true);
    setTemplatesError("");
    fetchTemplates()
      .then(setTemplates)
      .catch(() => setTemplatesError("Failed to load templates"))
      .finally(() => setTemplatesLoading(false));
  }, [tab, templates.length]);

  async function handleSend() {
    setSending(true);
    setError("");
    const ccPayload = cc.length > 0 ? cc : undefined;
    try {
      if (tab === "freeform") {
        // Wrap the signature in a marker div so the chat-feed "hide
        // signatures" toggle can strip it cleanly. Skip when the inbox has
        // none configured. Templates already include their own boilerplate
        // so we don't append.
        const finalBody = signatureHtml
          ? `${bodyHtml}<div data-signature>${signatureHtml}</div>`
          : bodyHtml;
        await replyToEmail(emailId, {
          bodyHtml: finalBody,
          fromAddress,
          ...(ccPayload ? { cc: ccPayload } : {}),
        });
      } else {
        if (!selectedSlug) {
          setError("Select a template");
          setSending(false);
          return;
        }
        await replyToEmail(emailId, {
          templateSlug: selectedSlug,
          variables: templateVars,
          fromAddress,
          ...(ccPayload ? { cc: ccPayload } : {}),
        });
      }
      onSent();
      onClose();
    } catch {
      setError("Failed to send reply");
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

  const recipientLabel = personName
    ? `${personName} <${personEmail}>`
    : personEmail;

  return (
    // Non-modal tray (Gmail-style): page behind stays interactive, only
    // X / Esc closes. Same shape as ComposeModal so the two feel like
    // one component family.
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
          data-testid="reply-composer"
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
                  <ReplyIcon size={18} />
                </span>
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-lg font-extrabold tracking-tight text-text-primary">
                    Reply
                  </DialogPrimitive.Title>
                  <p className="mt-0.5 truncate text-sm font-light text-text-tertiary">
                    To {recipientLabel}
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

          {/* Metadata: From / To */}
          <div className="shrink-0 border-b border-border bg-bg-subtle/40 px-6 py-3">
            <div className="grid grid-cols-[60px_1fr] items-center gap-3 py-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                <AtSign size={11} />
                From
              </span>
              <select
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
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
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                <Send size={11} />
                To
              </span>
              <span className="truncate text-sm text-text-primary">
                {recipientLabel}
              </span>
            </div>
            <div className="grid grid-cols-[60px_1fr] items-start gap-3 py-1">
              <span className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                Cc
              </span>
              <CcInput
                value={cc}
                onChange={setCc}
                internalDomains={internalDomains}
                testId="reply-cc-input"
              />
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-6 py-2.5">
            <div className="inline-flex rounded-[8px] bg-bg-muted/70 p-0.5 ring-1 ring-border">
              <ModeButton
                active={tab === "freeform"}
                onClick={() => setTab("freeform")}
                icon={Sparkles}
                label="Freeform"
              />
              <ModeButton
                active={tab === "template"}
                onClick={() => setTab("template")}
                icon={FileText}
                label="Template"
              />
            </div>
          </div>

          {/* Body */}
          <div className="smooth-scroll min-h-0 flex-1 overflow-y-auto bg-card">
            {tab === "freeform" ? (
              <div className="flex h-full min-h-[320px] flex-col gap-4 p-6">
                {/* Thread context — what you're replying to */}
                {originalEmail && (
                  <ThreadContext
                    original={originalEmail}
                    thread={threadEmails}
                    expanded={threadExpanded}
                    onToggle={() => setThreadExpanded((v) => !v)}
                  />
                )}
                {!originalEmail && contextError && (
                  <div
                    role="status"
                    className="rounded-[8px] border border-amber-300/40 bg-amber-100/40 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    Couldn't load the original message — it may have been
                    deleted. You can still send your reply.
                  </div>
                )}
                <div className="min-h-[260px] flex-1">
                  <TiptapEditor
                    content={bodyHtml}
                    onUpdate={setBodyHtml}
                    placeholder="Write your reply…"
                  />
                  {signatureHtml && (
                    <div
                      data-signature
                      data-testid="reply-signature-preview"
                      className="mt-4 border-t border-border/60 pt-3 opacity-70"
                      dangerouslySetInnerHTML={{ __html: signatureHtml }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-6">
                {templatesLoading ? (
                  <p className="text-sm font-light text-text-tertiary">
                    Loading templates…
                  </p>
                ) : templatesError ? (
                  <p className="text-sm text-destructive">{templatesError}</p>
                ) : (
                  <>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                        Template
                      </label>
                      <select
                        value={selectedSlug}
                        onChange={(e) => setSelectedSlug(e.target.value)}
                        className="w-full rounded-[8px] border border-border bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-text-primary/15"
                      >
                        <option value="">Select a template…</option>
                        {templates.map((t) => (
                          <option key={t.slug} value={t.slug}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTemplate && (
                      <>
                        <div className="rounded-[8px] bg-bg-subtle/60 p-4 ring-1 ring-border">
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                            Subject
                          </p>
                          <p className="text-sm font-medium text-text-primary">
                            {selectedTemplate.subject}
                          </p>
                          <div className="mt-3 border-t border-border pt-3">
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                              Body preview
                            </p>
                            <div
                              className="prose prose-sm max-h-48 max-w-none overflow-auto text-sm text-text-secondary"
                              dangerouslySetInnerHTML={{
                                __html: selectedTemplate.bodyHtml,
                              }}
                            />
                          </div>
                        </div>

                        {requiredVars.length > 0 && (
                          <div>
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                              Variables
                            </p>
                            <div className="space-y-2">
                              {requiredVars.map((v) => (
                                <div
                                  key={v}
                                  className="grid grid-cols-[120px_1fr] items-center gap-3"
                                >
                                  <label className="truncate font-mono text-xs text-text-tertiary">
                                    {`{{${v}}}`}
                                  </label>
                                  <input
                                    value={templateVars[v] ?? ""}
                                    onChange={(e) =>
                                      setTemplateVars((prev) => ({
                                        ...prev,
                                        [v]: e.target.value,
                                      }))
                                    }
                                    className="rounded-[6px] border border-border bg-card px-2.5 py-1.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-text-primary/15"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-bg-subtle/40 px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-light text-text-tertiary">
                {error ? (
                  <span className="text-destructive">{error}</span>
                ) : (
                  <>
                    <kbd className="rounded border border-border bg-card px-1 text-[10px] font-medium text-text-secondary">
                      ⌘
                    </kbd>{" "}
                    +{" "}
                    <kbd className="rounded border border-border bg-card px-1 text-[10px] font-medium text-text-secondary">
                      Enter
                    </kbd>{" "}
                    to send
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="rounded-[8px] px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  data-testid="reply-send-button"
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-text-primary px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={12} />
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}
function ModeButton({ active, onClick, icon: Icon, label }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-xs font-medium transition-all",
        active
          ? "bg-card text-text-primary shadow-sm"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

interface ThreadContextProps {
  original: Email;
  thread: Email[];
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Renders the email being replied to with a collapsible older thread above
 * it. Lets the user reference the conversation while drafting without
 * leaving the composer.
 */
function ThreadContext({
  original,
  thread,
  expanded,
  onToggle,
}: ThreadContextProps) {
  // Older messages (everything except the original), oldest → newest.
  const olderEmails = useMemo(() => {
    const others = thread.filter((e) => e.id !== original.id);
    return [...others].sort((a, b) => a.timestamp - b.timestamp);
  }, [thread, original.id]);

  return (
    <div className="rounded-[8px] bg-bg-subtle/60 ring-1 ring-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <ReplyIcon size={13} className="shrink-0 text-text-tertiary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            Replying to
          </span>
          {original.subject && (
            <span className="truncate text-xs font-medium text-text-secondary">
              · {original.subject}
            </span>
          )}
        </div>
        {olderEmails.length > 0 && (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary"
          >
            {expanded ? (
              <>
                <ChevronUp size={12} />
                Hide history
              </>
            ) : (
              <>
                <ChevronDown size={12} />
                Show {olderEmails.length} earlier
              </>
            )}
          </button>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto smooth-scroll">
        {expanded && olderEmails.length > 0 && (
          <div className="divide-y divide-border/60">
            {olderEmails.map((e) => (
              <ThreadMessage key={e.id} email={e} muted />
            ))}
          </div>
        )}
        <div className={olderEmails.length > 0 ? "border-t border-border" : ""}>
          <ThreadMessage email={original} highlight />
        </div>
      </div>
    </div>
  );
}

interface ThreadMessageProps {
  email: Email;
  muted?: boolean;
  highlight?: boolean;
}

function ThreadMessage({ email, muted, highlight }: ThreadMessageProps) {
  const isSent = email.type === "sent";
  const sender = isSent
    ? `you (${email.fromAddress ?? "—"})`
    : (email.fromAddress ?? "Unknown");
  const recipient = isSent ? email.toAddress : email.recipient;
  const ts = new Date(email.timestamp * 1000);
  const fullStamp = `${ts.toLocaleDateString([], { month: "short", day: "numeric" })} · ${ts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div
      className={cn(
        "px-4 py-3",
        highlight ? "bg-card" : "bg-transparent",
        muted && "opacity-90",
      )}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px]">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            isSent
              ? "bg-bg-muted text-text-secondary"
              : "bg-violet/10 text-violet",
          )}
          style={!isSent ? { color: "#7c5cfc" } : undefined}
        >
          {isSent ? (
            <>
              <Send size={9} />
              Sent
            </>
          ) : (
            <>
              <InboxIcon size={9} />
              Received
            </>
          )}
        </span>
        <span className="truncate font-medium text-text-primary">{sender}</span>
        {recipient && (
          <span className="truncate text-text-tertiary">→ {recipient}</span>
        )}
        <span className="ml-auto shrink-0 text-text-tertiary">{fullStamp}</span>
      </div>
      {email.bodyHtml ? (
        <div
          className={cn(
            "prose prose-sm max-w-none text-[13px] leading-relaxed [&_p]:my-1.5",
            highlight ? "text-text-primary" : "text-text-secondary",
          )}
          dangerouslySetInnerHTML={{
            __html: sanitizeEmailHtml(email.bodyHtml),
          }}
        />
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-text-secondary">
          {email.bodyText || "(no text)"}
        </pre>
      )}
    </div>
  );
}
