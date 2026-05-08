import { Paperclip, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupedConversation } from "@/lib/api";

// Same palette + hashing as PersonList's avatarColor — keeps the visual
// language consistent between person rows and group avatars.
const AVATAR_PALETTE = [
  { bg: "rgba(124, 92, 252, 0.12)", fg: "#5b3ce6" },
  { bg: "rgba(34, 197, 94, 0.12)", fg: "#15803d" },
  { bg: "rgba(244, 114, 182, 0.14)", fg: "#be185d" },
  { bg: "rgba(251, 146, 60, 0.14)", fg: "#c2410c" },
  { bg: "rgba(56, 189, 248, 0.14)", fg: "#0369a1" },
  { bg: "rgba(168, 85, 247, 0.14)", fg: "#7e22ce" },
  { bg: "rgba(20, 184, 166, 0.14)", fg: "#0f766e" },
  { bg: "rgba(234, 179, 8, 0.16)", fg: "#a16207" },
];

function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(name: string | null, email: string) {
  const source = name || email.split("@")[0];
  const parts = source.split(/[\s.\-_]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase() || "?";
}

function formatTime(ts: number) {
  const date = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 1) {
    const m = Math.max(1, Math.floor(diffMs / 60_000));
    return `${m}m`;
  }
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffH < 24 * 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupLabel(participants: GroupedConversation["participants"]): string {
  if (participants.length === 0) return "Group conversation";
  const names = participants.map((p) => {
    if (p.name && p.name.trim()) return p.name.trim().split(/\s+/)[0];
    return p.email.split("@")[0];
  });
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

interface GroupRowProps {
  group: GroupedConversation;
  isSelected: boolean;
  onSelect: () => void;
  onMarkRead?: (id: string) => void;
}

/**
 * Inbox sidebar row for a multi-participant thread. Renders overlapping
 * avatar circles for the external participants, a comma-separated name
 * list, and the same meta line as PersonList rows (count + time + unread
 * badge). Internal CCs aren't surfaced here — they're scoped to the
 * thread but don't define its identity.
 */
export default function GroupRow({
  group,
  isSelected,
  onSelect,
  onMarkRead,
}: GroupRowProps) {
  const display = groupLabel(group.participants);
  // Show the first 3 avatars overlapping; any extras get a "+N" chip.
  const visible = group.participants.slice(0, 3);
  const overflow = Math.max(0, group.participants.length - visible.length);

  return (
    <li
      className={cn(
        "group relative transition-colors",
        isSelected ? "bg-text-primary/[0.04]" : "hover:bg-text-primary/[0.025]",
      )}
    >
      {isSelected && (
        <span
          className="absolute inset-y-2 left-0 w-0.5 rounded-full"
          style={{ backgroundColor: "#7c5cfc" }}
          aria-hidden
        />
      )}

      <button
        data-testid="group-row"
        data-conversation-id={group.id}
        onClick={onSelect}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left active:bg-text-primary/[0.04] sm:py-2"
      >
        {/* Overlapping avatars — like a group-chat icon */}
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          {visible.map((p, i) => {
            const color = avatarColor(p.email);
            return (
              <span
                key={p.id}
                title={p.name || p.email}
                className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold tracking-tight ring-2 ring-card"
                style={{
                  backgroundColor: color.bg,
                  color: color.fg,
                  left: `${i * 7}px`,
                  top: `${i % 2 === 0 ? 0 : 8}px`,
                  zIndex: visible.length - i,
                }}
              >
                {initials(p.name, p.email)}
              </span>
            );
          })}
          {overflow > 0 && (
            <span
              className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-bg-muted text-[10px] font-semibold text-text-secondary ring-2 ring-card"
              style={{
                left: `${visible.length * 7}px`,
                top: `${visible.length % 2 === 0 ? 0 : 8}px`,
              }}
              title={`+${overflow} more participants`}
            >
              +{overflow}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1 pl-2">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 truncate text-sm",
                group.unreadCount > 0
                  ? "font-semibold text-text-primary"
                  : "font-medium text-text-primary",
              )}
            >
              <Users size={11} className="shrink-0 text-text-tertiary" />
              <span className="truncate">{display}</span>
            </span>
            <span className="shrink-0 text-[11px] font-light text-text-tertiary">
              {formatTime(group.lastEmailAt)}
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <span className="truncate">{group.inbox.split("@")[0]}</span>
              <span className="text-text-tertiary/40">·</span>
              <span>
                {group.totalCount} message{group.totalCount !== 1 ? "s" : ""}
              </span>
              {group.hasAttachment === 1 && (
                <Paperclip
                  size={10}
                  className="text-text-tertiary"
                  aria-label="Has attachment"
                />
              )}
            </div>

            {group.unreadCount > 0 && (
              <span
                role="button"
                tabIndex={0}
                title="Tap to mark all as read"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead?.(group.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onMarkRead?.(group.id);
                  }
                }}
                className="flex h-5 min-w-5 cursor-pointer items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: "#7c5cfc" }}
              >
                {group.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
