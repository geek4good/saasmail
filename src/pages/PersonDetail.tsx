import { useState, useEffect, useMemo, useRef } from "react";
import { CheckCheck } from "lucide-react";
import {
  fetchPersonEmails,
  markEmailRead,
  markPeopleRead,
  deleteEmail,
  fetchPersonEnrollment,
  fetchStats,
  type GroupedPerson,
  type Email,
  type PersonEnrollmentInfo,
  type InboxDisplayMode,
} from "@/lib/api";
import EnrollSequenceModal from "@/components/EnrollSequenceModal";
import SequenceStatus from "@/components/SequenceStatus";
import EmailHtmlModal from "@/components/EmailHtmlModal";
import ReplyComposer from "@/components/ReplyComposer";
import ThreadInboxSection, {
  type ThreadInboxGroup,
} from "@/components/ThreadInboxSection";
import ChatInboxSection from "@/components/ChatInboxSection";
import { cn } from "@/lib/utils";

interface PersonDetailProps {
  person: GroupedPerson;
  onEmailRead: (personId: string) => void;
  onEmailDelete: (personId: string, wasUnread: boolean) => void;
  refreshKey?: number;
}

function inboxOf(email: Email): string {
  return (
    (email.type === "received" ? email.recipient : email.fromAddress) ??
    "(unknown)"
  );
}

function groupEmailsByInbox(emails: Email[]): ThreadInboxGroup[] {
  const byInbox = new Map<string, Email[]>();
  for (const email of emails) {
    const key = inboxOf(email);
    const list = byInbox.get(key);
    if (list) list.push(email);
    else byInbox.set(key, [email]);
  }
  const groups: ThreadInboxGroup[] = [];
  for (const [inbox, list] of byInbox) {
    const latestReceivedTs =
      list.find((e) => e.type === "received")?.timestamp ?? 0;
    const latestAnyTs = list[0]?.timestamp ?? 0;
    groups.push({
      inbox,
      emails: list,
      latestTimestamp: latestReceivedTs || latestAnyTs,
    });
  }
  groups.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  return groups;
}

function inboxColor(seed: string) {
  // Stable but per-inbox accent so the active tab feels distinct.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const palette = [
    "#7c5cfc",
    "#0f766e",
    "#0369a1",
    "#a16207",
    "#be185d",
    "#7e22ce",
  ];
  return palette[h % palette.length];
}

function unreadIn(group: ThreadInboxGroup): number {
  return group.emails.filter((e) => e.type === "received" && e.isRead === 0)
    .length;
}

/** Strip the @domain — every inbox shares the same domain, so the tab
 *  just shows the local-part (e.g., "support" instead of "support@example.com").
 *  Falls back to the full string if there's no @. */
function inboxLabel(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

export default function PersonDetail({
  person,
  onEmailRead,
  onEmailDelete,
  refreshKey,
}: PersonDetailProps) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollmentInfo, setEnrollmentInfo] =
    useState<PersonEnrollmentInfo | null>(null);
  const [htmlPreviewEmail, setHtmlPreviewEmail] = useState<Email | null>(null);
  const [replyToEmailId, setReplyToEmailId] = useState<string | null>(null);
  const [expandedOlder, setExpandedOlder] = useState<Record<string, boolean>>(
    {},
  );
  const [inboxModeMap, setInboxModeMap] = useState<
    Map<string, InboxDisplayMode>
  >(new Map());
  const [senderIdentities, setSenderIdentities] = useState<
    Array<{ email: string; displayName: string | null }>
  >([]);
  const [activeInbox, setActiveInbox] = useState<string | null>(null);

  function refetchEmails() {
    fetchPersonEmails(person.id).then((res) => {
      setEmails(res.emails);
      setInboxModeMap(
        new Map(res.inboxes.map((i) => [i.email, i.displayMode])),
      );
    });
  }

  useEffect(() => {
    setLoading(true);
    setReplyToEmailId(null);
    setExpandedOlder({});
    setActiveInbox(null);
    fetchPersonEmails(person.id)
      .then((res) => {
        setEmails(res.emails);
        setInboxModeMap(
          new Map(res.inboxes.map((i) => [i.email, i.displayMode])),
        );
      })
      .finally(() => setLoading(false));
  }, [person.id]);

  useEffect(() => {
    if (refreshKey) refetchEmails();
  }, [refreshKey]);

  useEffect(() => {
    fetchPersonEnrollment(person.id).then(setEnrollmentInfo);
  }, [person.id]);

  useEffect(() => {
    fetchStats().then((stats) => {
      setSenderIdentities(stats.senderIdentities ?? []);
    });
  }, []);

  function refreshEnrollment() {
    fetchPersonEnrollment(person.id).then(setEnrollmentInfo);
  }

  async function handleMarkRead(email: Email) {
    if (email.type !== "received" || email.isRead !== 0) return;
    await markEmailRead(email.id, true);
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, isRead: 1 } : e)),
    );
    onEmailRead(person.id);
  }

  async function handleMarkInboxRead(inboxAddress: string) {
    // Optimistic local update on the active inbox's emails.
    setEmails((prev) =>
      prev.map((e) =>
        e.recipient === inboxAddress && e.type === "received" && e.isRead === 0
          ? { ...e, isRead: 1 }
          : e,
      ),
    );
    try {
      await markPeopleRead([person.id], inboxAddress);
      onEmailRead(person.id);
    } catch {
      refetchEmails();
    }
  }

  async function handleDelete(emailId: string) {
    if (
      !confirm(
        "Permanently delete this email and all its attachments? This cannot be undone.",
      )
    )
      return;
    const target = emails.find((e) => e.id === emailId);
    const wasUnread = target?.type === "received" && target.isRead === 0;
    await deleteEmail(emailId);
    setEmails((prev) => prev.filter((e) => e.id !== emailId));
    onEmailDelete(person.id, wasUnread);
  }

  const inboxGroups = useMemo(() => groupEmailsByInbox(emails), [emails]);
  const distinctInboxes = useMemo(
    () => inboxGroups.map((g) => g.inbox).filter((i) => i !== "(unknown)"),
    [inboxGroups],
  );

  // Auto-pick the first (most-recent) inbox as active when person/emails load.
  useEffect(() => {
    if (inboxGroups.length === 0) {
      setActiveInbox(null);
      return;
    }
    if (!activeInbox || !inboxGroups.find((g) => g.inbox === activeInbox)) {
      setActiveInbox(inboxGroups[0].inbox);
    }
  }, [inboxGroups, activeInbox]);

  const activeGroup =
    inboxGroups.find((g) => g.inbox === activeInbox) ?? inboxGroups[0] ?? null;

  const replyInboxForEmail = (email: Email) => {
    const ib = inboxOf(email);
    return ib === "(unknown)" ? distinctInboxes : [ib];
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-tertiary">
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Person header */}
      <div className="shrink-0 border-b border-border bg-card px-6 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold tracking-tight text-text-primary">
              {person.name || person.email}
            </h2>
            {person.name && (
              <p className="mt-0.5 truncate text-sm font-light text-text-tertiary">
                {person.email}
              </p>
            )}
            <p className="mt-2 text-xs text-text-secondary">
              {person.totalCount} message
              {person.totalCount !== 1 ? "s" : ""}
              {inboxGroups.length > 1
                ? ` across ${inboxGroups.length} inboxes`
                : ""}
            </p>
          </div>

          <div className="shrink-0">
            {enrollmentInfo?.enrollment ? (
              <SequenceStatus
                personId={person.id}
                onStatusChange={refreshEnrollment}
              />
            ) : (
              <button
                onClick={() => setEnrollModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
              >
                Add to sequence
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inbox tabs — short label (local-part only), counts + mode dot.
          Tooltip on the tab shows the full address.
          On mobile: horizontal scroll with snap (native-app feel).
          On desktop: wraps onto multiple lines. */}
      {inboxGroups.length > 0 && (
        <div className="shrink-0 border-b border-border bg-card/60">
          <div
            className="smooth-scroll flex gap-1 overflow-x-auto px-3 py-2 sm:flex-wrap sm:overflow-visible"
            style={{ scrollSnapType: "x proximity" }}
          >
            {inboxGroups.map((group) => {
              const mode = inboxModeMap.get(group.inbox) ?? "chat";
              const unread = unreadIn(group);
              const isActive = activeGroup?.inbox === group.inbox;
              const accent = inboxColor(group.inbox);
              const label = inboxLabel(group.inbox);
              return (
                <button
                  key={group.inbox}
                  data-testid="inbox-tab"
                  onClick={() => setActiveInbox(group.inbox)}
                  title={`${group.inbox} · ${mode} mode`}
                  style={{ scrollSnapAlign: "start" }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-[8px] px-3 py-1.5 text-sm transition-all",
                    isActive
                      ? "bg-text-primary/[0.05] text-text-primary ring-1 ring-text-primary/10"
                      : "text-text-secondary hover:bg-bg-muted/70 hover:text-text-primary",
                  )}
                >
                  {/* Mode-aware accent dot — color stable per inbox */}
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      mode === "chat" ? "" : "opacity-60",
                    )}
                    style={{ backgroundColor: accent }}
                    aria-hidden
                  />
                  <span className="font-medium">{label}</span>
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-text-secondary">
                    {group.emails.length}
                  </span>
                  {unread > 0 && (
                    <span
                      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white"
                      style={{ backgroundColor: "#7c5cfc" }}
                      aria-label={`${unread} unread`}
                    >
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-inbox action row — visible when the active tab has unread emails */}
      {activeGroup && unreadIn(activeGroup) > 0 && (
        <div className="shrink-0 border-b border-border bg-bg-subtle/40 px-4 py-2">
          <button
            type="button"
            onClick={() => handleMarkInboxRead(activeGroup.inbox)}
            className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
          >
            <CheckCheck size={12} />
            Mark all in {inboxLabel(activeGroup.inbox)} as read
            <span className="ml-1 rounded-full bg-text-primary/[0.06] px-1.5 text-[10px] font-bold tabular-nums text-text-secondary">
              {unreadIn(activeGroup)}
            </span>
          </button>
        </div>
      )}

      {/* Active inbox section — fills remaining height */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeGroup ? (
          (() => {
            const mode = inboxModeMap.get(activeGroup.inbox) ?? "chat";
            if (mode === "chat") {
              return (
                <ChatInboxSection
                  key={activeGroup.inbox}
                  group={activeGroup}
                  personEmail={person.email}
                  onOpenHtml={setHtmlPreviewEmail}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDelete}
                  onSent={refetchEmails}
                />
              );
            }
            return (
              <ThreadPaneScroller key={activeGroup.inbox}>
                <ThreadInboxSection
                  group={activeGroup}
                  personEmail={person.email}
                  isOlderExpanded={!!expandedOlder[activeGroup.inbox]}
                  onToggleOlder={() =>
                    setExpandedOlder((prev) => ({
                      ...prev,
                      [activeGroup.inbox]: !prev[activeGroup.inbox],
                    }))
                  }
                  onOpenHtml={setHtmlPreviewEmail}
                  onMarkRead={handleMarkRead}
                  onReply={setReplyToEmailId}
                  onDelete={handleDelete}
                />
              </ThreadPaneScroller>
            );
          })()
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            No emails found.
          </div>
        )}

        {/* Reply composer (thread mode) */}
        {replyToEmailId && (
          <ReplyComposer
            emailId={replyToEmailId}
            personName={person.name}
            personEmail={person.email}
            recipients={(() => {
              const target = emails.find((e) => e.id === replyToEmailId);
              return target ? replyInboxForEmail(target) : distinctInboxes;
            })()}
            senderIdentities={senderIdentities}
            onClose={() => setReplyToEmailId(null)}
            onSent={refetchEmails}
          />
        )}
      </div>

      <EmailHtmlModal
        email={htmlPreviewEmail}
        open={htmlPreviewEmail !== null}
        onClose={() => setHtmlPreviewEmail(null)}
      />

      <EnrollSequenceModal
        personId={person.id}
        personName={person.name}
        personEmail={person.email}
        recipients={distinctInboxes}
        open={enrollModalOpen}
        onClose={() => setEnrollModalOpen(false)}
        onEnrolled={refreshEnrollment}
      />
    </div>
  );
}

/** Scroll wrapper for thread-mode inbox content. */
function ThreadPaneScroller({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={scrollRef}
      className="smooth-scroll min-h-0 flex-1 overflow-y-auto"
    >
      {children}
    </div>
  );
}
