import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import {
  Inbox,
  Maximize2,
  Paperclip,
  Trash2,
  ArrowDown,
  Check,
  CheckCheck,
} from "lucide-react";
import type { Email } from "@/lib/api";
import type { ThreadInboxGroup } from "@/components/ThreadInboxSection";
import ChatQuickReply from "@/components/ChatQuickReply";

interface ChatInboxSectionProps {
  group: ThreadInboxGroup;
  personEmail: string;
  onOpenHtml: (email: Email) => void;
  onMarkRead: (email: Email) => void;
  onDelete: (emailId: string) => void;
  onSent: () => void;
}

const BUBBLE_TRUNCATE_CHARS = 480;

function emailToText(email: Email): string {
  if (email.bodyText) return email.bodyText;
  if (email.bodyHtml) {
    return (
      new DOMParser().parseFromString(email.bodyHtml, "text/html").body
        .textContent ?? ""
    );
  }
  return "";
}

function dayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dDay.getTime() === today.getTime()) return "Today";
  if (dDay.getTime() === yesterday.getTime()) return "Yesterday";
  if (now.getTime() - dDay.getTime() < 6 * 86_400_000) {
    return d.toLocaleDateString([], { weekday: "long" });
  }
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

interface BubbleProps {
  email: Email;
  onOpenHtml: (email: Email) => void;
  onMarkRead: (email: Email) => void;
  onDelete: (emailId: string) => void;
}

function Bubble({ email, onOpenHtml, onMarkRead, onDelete }: BubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isSent = email.type === "sent";
  const isUnread = email.type === "received" && email.isRead === 0;

  const text = useMemo(() => emailToText(email), [email]);
  const truncated = text.length > BUBBLE_TRUNCATE_CHARS && !expanded;
  const displayText = truncated
    ? text.slice(0, BUBBLE_TRUNCATE_CHARS).trimEnd() + "…"
    : text;

  const ts = new Date(email.timestamp * 1000);
  const stamp = ts.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const downloadable = (email.attachments ?? []).filter((a) => !a.contentId);

  function handleClick() {
    if (isUnread) onMarkRead(email);
  }

  return (
    <div
      data-testid="chat-bubble"
      className={`group flex flex-col px-4 py-1 sm:px-6 ${
        isSent ? "items-end" : "items-start"
      }`}
      onClick={handleClick}
      title={email.subject ?? undefined}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[78%] ${
          isSent
            ? "bg-text-primary text-white"
            : "bg-white text-text-primary ring-1 ring-border"
        } ${isUnread ? "outline outline-2 outline-violet/40" : ""}`}
      >
        {displayText ? (
          <p className="whitespace-pre-wrap break-words">{displayText}</p>
        ) : (
          <p className="italic opacity-60">(no text content)</p>
        )}
        {text.length > BUBBLE_TRUNCATE_CHARS && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className={`mt-1.5 text-xs font-medium underline-offset-2 hover:underline ${
              isSent ? "text-white/85" : "text-text-secondary"
            }`}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {downloadable.length > 0 && (
        <div
          className={`mt-1.5 flex max-w-[85%] flex-wrap gap-1.5 sm:max-w-[78%] ${
            isSent ? "justify-end" : "justify-start"
          }`}
        >
          {downloadable.map((att) => (
            <a
              key={att.id}
              href={`/api/attachments/${att.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-[6px] border border-border bg-card px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-bg-muted"
            >
              <Paperclip size={11} />
              {att.filename}
            </a>
          ))}
        </div>
      )}

      <div
        className={`mt-1 flex items-center gap-2 text-[10px] text-text-tertiary ${isSent ? "flex-row-reverse" : ""}`}
      >
        <span>{stamp}</span>
        {isSent &&
          (email.deliveredAt ? (
            <CheckCheck size={11} className="text-text-tertiary" />
          ) : (
            <Check size={11} className="text-text-tertiary" />
          ))}
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {email.bodyHtml && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenHtml(email);
              }}
              className="flex items-center gap-1 hover:text-text-secondary"
              title="View original"
            >
              <Maximize2 size={10} />
              View original
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(email.id);
            }}
            className="flex items-center gap-1 hover:text-red-500"
            title="Delete email"
          >
            <Trash2 size={10} />
          </button>
        </div>
        {isUnread && !isSent && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "#7c5cfc" }}
          />
        )}
      </div>
    </div>
  );
}

interface DaySeparatorProps {
  label: string;
}
function DaySeparator({ label }: DaySeparatorProps) {
  return (
    <div className="flex items-center gap-2 px-6 py-3">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-bg-muted px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function ChatInboxSection({
  group,
  personEmail: _personEmail,
  onOpenHtml,
  onMarkRead,
  onDelete,
  onSent,
}: ChatInboxSectionProps) {
  // Chronological order — oldest at top, newest at bottom.
  const chronological = useMemo(
    () => [...group.emails].reverse(),
    [group.emails],
  );

  // Group items by day for separators.
  const items = useMemo(() => {
    const out: Array<
      | { kind: "day"; key: string; label: string }
      | { kind: "msg"; email: Email }
    > = [];
    let lastDay = "";
    for (const email of chronological) {
      const label = dayLabel(email.timestamp);
      if (label !== lastDay) {
        out.push({ kind: "day", key: `day-${label}-${email.id}`, label });
        lastDay = label;
      }
      out.push({ kind: "msg", email });
    }
    return out;
  }, [chronological]);

  const replyTarget = useMemo(
    () => group.emails.find((e) => e.type === "received") ?? null,
    [group.emails],
  );

  // Scroll state for the messages pane
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const previousMsgIdsRef = useRef<Set<string>>(new Set());

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    bottomRef.current?.scrollIntoView({ block: "end", behavior });
    setHasNewBelow(false);
    setIsAtBottom(true);
  }

  useLayoutEffect(() => {
    // Initial mount: jump to latest without animation
    scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ids = new Set(chronological.map((e) => e.id));
    const prev = previousMsgIdsRef.current;
    let hasNew = false;
    for (const id of ids) {
      if (!prev.has(id)) {
        hasNew = true;
        break;
      }
    }
    previousMsgIdsRef.current = ids;
    if (!hasNew) return;
    if (isAtBottom) {
      // User is already at bottom: keep them pinned to latest.
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } else {
      // User scrolled up: surface a "new message" indicator instead.
      setHasNewBelow(true);
    }
  }, [chronological, isAtBottom]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 24;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewBelow(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-subtle/40">
      {/* Inbox header — sticky at top of section */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-6 py-2.5 backdrop-blur-sm">
        <Inbox size={13} className="text-text-tertiary" />
        <span className="text-sm font-medium text-text-primary">
          {group.inbox}
        </span>
        <span className="text-xs text-text-tertiary">
          · {group.emails.length} message
          {group.emails.length !== 1 ? "s" : ""} · chat
        </span>
      </div>

      {/* Scrollable messages area */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Top fade — hints at scrollable content above */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-bg-subtle/60 to-transparent"
          aria-hidden
        />

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="smooth-scroll flex-1 overflow-y-auto py-2"
        >
          {items.map((item) =>
            item.kind === "day" ? (
              <DaySeparator key={item.key} label={item.label} />
            ) : (
              <Bubble
                key={item.email.id}
                email={item.email}
                onOpenHtml={onOpenHtml}
                onMarkRead={onMarkRead}
                onDelete={onDelete}
              />
            ),
          )}
          <div ref={bottomRef} className="h-2" />
        </div>

        {/* Bottom fade — hints at scrollable content below */}
        {!isAtBottom && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-bg-subtle/70 to-transparent"
            aria-hidden
          />
        )}

        {/* Floating "Jump to latest" pill */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className={`absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-all ${
              hasNewBelow
                ? "bg-text-primary text-white"
                : "bg-card text-text-primary ring-1 ring-border"
            }`}
          >
            <ArrowDown size={12} />
            {hasNewBelow ? "New messages" : "Jump to latest"}
          </button>
        )}
      </div>

      {/* Sticky reply at the bottom of the section */}
      <div className="shrink-0">
        <ChatQuickReply
          inboxAddress={group.inbox}
          latestReceivedEmailId={replyTarget?.id ?? null}
          personEmail={_personEmail}
          onSent={onSent}
        />
      </div>
    </div>
  );
}
