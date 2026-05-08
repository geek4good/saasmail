import { useState, useEffect, useMemo, useRef } from "react";
import { Users, CheckCheck } from "lucide-react";
import {
  fetchConversationEmails,
  markEmailRead,
  deleteEmail,
  fetchStats,
  type GroupedConversation,
  type Email,
  type ConversationDetail as ConversationDetailData,
  type InboxDisplayMode,
} from "@/lib/api";
import EmailHtmlModal from "@/components/EmailHtmlModal";
import ReplyComposer from "@/components/ReplyComposer";
import ThreadInboxSection, {
  type ThreadInboxGroup,
} from "@/components/ThreadInboxSection";
import ChatInboxSection from "@/components/ChatInboxSection";

interface ConversationDetailProps {
  conversation: GroupedConversation;
  refreshKey?: number;
  /** Domains we treat as "internal" for CC chip coloring. */
  internalDomains?: string[];
}

function inboxLabel(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

/**
 * Group-conversation timeline. Mirrors PersonDetail but for threads with
 * 2+ external participants — every bubble shows its actual sender, not
 * a single "person" identity.
 *
 * The conversation is scoped to one inbox (that's how groups are keyed),
 * so we don't show inbox tabs the way PersonDetail does.
 */
export default function ConversationDetail({
  conversation,
  refreshKey,
  internalDomains = [],
}: ConversationDetailProps) {
  const [data, setData] = useState<ConversationDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [htmlPreviewEmail, setHtmlPreviewEmail] = useState<Email | null>(null);
  const [replyToEmailId, setReplyToEmailId] = useState<string | null>(null);
  const [inboxMode, setInboxMode] = useState<InboxDisplayMode>("chat");
  const [senderIdentities, setSenderIdentities] = useState<
    Array<{ email: string; displayName: string | null }>
  >([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function refetch() {
    fetchConversationEmails(conversation.id).then(setData);
  }

  useEffect(() => {
    setLoading(true);
    setReplyToEmailId(null);
    fetchConversationEmails(conversation.id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [conversation.id]);

  useEffect(() => {
    if (refreshKey) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    fetchStats().then((stats) => {
      setSenderIdentities(stats.senderIdentities ?? []);
      // Resolve the display mode the operator configured for this inbox.
      // Falls back to "chat" if missing — the same default as PersonDetail.
      const allInboxes = stats.senderIdentities ?? [];
      const match = allInboxes.find((i) => i.email === conversation.inbox);
      if (match) {
        // Stats doesn't expose displayMode; we'd need to fetch separately.
        // For now leave the default.
        void match;
      }
    });
  }, [conversation.inbox]);

  async function handleMarkRead(email: Email) {
    if (email.type !== "received" || email.isRead !== 0) return;
    await markEmailRead(email.id, true);
    setData((prev) =>
      prev
        ? {
            ...prev,
            emails: prev.emails.map((e) =>
              e.id === email.id ? { ...e, isRead: 1 } : e,
            ),
          }
        : prev,
    );
  }

  async function handleDelete(emailId: string) {
    if (
      !confirm(
        "Permanently delete this email and all its attachments? This cannot be undone.",
      )
    )
      return;
    await deleteEmail(emailId);
    setData((prev) =>
      prev
        ? {
            ...prev,
            emails: prev.emails.filter((e) => e.id !== emailId),
          }
        : prev,
    );
  }

  // Adapter: ChatInboxSection / ThreadInboxSection both expect a
  // ThreadInboxGroup (one inbox, newest-first emails). We only have one
  // inbox per conversation, so the adapter is straightforward — but the
  // section orders newest-first while the API returns chronological, so
  // we reverse here.
  const group: ThreadInboxGroup | null = useMemo(() => {
    if (!data) return null;
    const newestFirst = [...data.emails].reverse();
    const latestTimestamp = newestFirst[0]?.timestamp ?? 0;
    return {
      inbox: conversation.inbox,
      emails: newestFirst,
      latestTimestamp,
    };
  }, [data, conversation.inbox]);

  // Map personId → {name, email} so each bubble can resolve its actual
  // sender. The conversation endpoint already returns participants —
  // we just denormalize into a Map for O(1) lookup.
  const senderById = useMemo(() => {
    const m = new Map<string, { email: string; name: string | null }>();
    for (const p of conversation.participants) {
      m.set(p.id, { email: p.email, name: p.name });
    }
    return m;
  }, [conversation.participants]);

  // Reply targets default to the most recent received email's CC + sender.
  const replyTarget = useMemo(() => {
    if (!data) return null;
    for (let i = data.emails.length - 1; i >= 0; i--) {
      if (data.emails[i].type === "received") return data.emails[i];
    }
    return null;
  }, [data]);

  if (loading || !data || !group) {
    return (
      <div className="flex h-full items-center justify-center text-text-tertiary">
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  const totalUnread = group.emails.filter(
    (e) => e.type === "received" && e.isRead === 0,
  ).length;

  const participantNames = conversation.participants
    .map((p) => p.name?.split(/\s+/)[0] ?? p.email.split("@")[0])
    .join(", ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Conversation header — overlapping avatars + comma-separated names */}
      <div className="shrink-0 border-b border-border bg-card px-4 pb-2.5 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="flex items-center gap-1.5 truncate text-base font-extrabold tracking-tight text-text-primary">
              <Users size={14} className="shrink-0 text-text-tertiary" />
              {participantNames || "Group conversation"}
            </h2>
            <span className="truncate text-xs font-light text-text-tertiary">
              {conversation.inbox}
            </span>
            <span className="text-[11px] text-text-tertiary">
              · {data.emails.length} message
              {data.emails.length !== 1 ? "s" : ""}
              {" · "}
              {conversation.participants.length} participants
            </span>
          </div>
          {totalUnread > 0 && (
            <button
              type="button"
              onClick={() => {
                // Mark every unread received email read sequentially.
                for (const e of data.emails) {
                  if (e.type === "received" && e.isRead === 0) {
                    handleMarkRead(e);
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-card px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Inbox label — slim, just shows which of OUR inboxes this thread lives in */}
      <div className="shrink-0 border-b border-border bg-bg-subtle/40 px-4 py-1.5 text-[11px] text-text-tertiary">
        {inboxLabel(conversation.inbox)}@
      </div>

      {/* The merged timeline. Use chat-mode by default for groups since it
          handles "rapid back-and-forth between multiple people" better than
          the thread-mode collapsed view. */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col">
        {inboxMode === "chat" ? (
          <ChatInboxSection
            key={conversation.id}
            group={group}
            personEmail={conversation.participants[0]?.email ?? ""}
            internalDomains={internalDomains}
            senderResolver={(e) => {
              if (e.type === "sent") return null; // bubble shows "You"
              if (e.personId) {
                const r = senderById.get(e.personId);
                if (r) return r;
              }
              if (e.fromAddress) return { email: e.fromAddress, name: null };
              return null;
            }}
            onOpenHtml={setHtmlPreviewEmail}
            onMarkRead={handleMarkRead}
            onDelete={handleDelete}
            onSent={refetch}
          />
        ) : (
          <ThreadInboxSection
            group={group}
            personEmail={conversation.participants[0]?.email ?? ""}
            internalDomains={internalDomains}
            isOlderExpanded={true}
            onToggleOlder={() => {}}
            onOpenHtml={setHtmlPreviewEmail}
            onMarkRead={handleMarkRead}
            onReply={setReplyToEmailId}
            onDelete={handleDelete}
            senderResolver={(e) => {
              if (e.type === "sent") return null;
              if (e.personId) {
                const r = senderById.get(e.personId);
                if (r) return r;
              }
              if (e.fromAddress) return { email: e.fromAddress, name: null };
              return null;
            }}
          />
        )}
      </div>

      {/* Reply drawer */}
      {replyToEmailId && replyTarget && (
        <ReplyComposer
          emailId={replyToEmailId}
          personName={
            replyTarget.personId
              ? (senderById.get(replyTarget.personId)?.name ?? null)
              : null
          }
          personEmail={
            replyTarget.personId
              ? (senderById.get(replyTarget.personId)?.email ??
                replyTarget.fromAddress ??
                "")
              : (replyTarget.fromAddress ?? "")
          }
          recipients={[conversation.inbox]}
          senderIdentities={senderIdentities}
          internalDomains={internalDomains}
          onClose={() => setReplyToEmailId(null)}
          onSent={refetch}
        />
      )}

      <EmailHtmlModal
        email={htmlPreviewEmail}
        open={htmlPreviewEmail !== null}
        onClose={() => setHtmlPreviewEmail(null)}
      />

      {/* Hidden — reserved if we want a chat/thread toggle later. */}
      <button
        type="button"
        className="hidden"
        onClick={() => setInboxMode((m) => (m === "chat" ? "thread" : "chat"))}
        aria-hidden
      />
    </div>
  );
}
