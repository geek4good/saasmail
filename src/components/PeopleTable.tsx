import { useMemo } from "react";
import { Paperclip, CheckCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GroupedItem,
  GroupedPerson,
  GroupedConversation,
} from "@/lib/api";

interface PeopleTableProps {
  /** Mixed list — both person and group rows render in the table. */
  items: GroupedItem[];
  loading?: boolean;
  onSelectPerson: (person: GroupedPerson) => void;
  onSelectConversation?: (conv: GroupedConversation) => void;
  /** Selected person IDs (used for bulk-mark-read on persons). */
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  /** Selected conversation IDs (parallel state for groups). */
  selectedConversationIds?: Set<string>;
  onToggleSelectedConversation?: (id: string) => void;
  /** Toggle "select all on page" — applies to both persons + groups. */
  onToggleSelectAll?: () => void;
  onMarkPersonRead?: (id: string) => void;
  onMarkConversationRead?: (id: string) => void;
}

const AVATAR_PALETTE = [
  { bg: "rgba(124, 92, 252, 0.12)", fg: "#5b3ce6" },
  { bg: "rgba(34, 197, 94, 0.12)", fg: "#15803d" },
  { bg: "rgba(244, 114, 182, 0.14)", fg: "#be185d" },
  { bg: "rgba(251, 146, 60, 0.14)", fg: "#c2410c" },
  { bg: "rgba(56, 189, 248, 0.14)", fg: "#0369a1" },
  { bg: "rgba(168, 85, 247, 0.14)", fg: "#7e22ce" },
];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name: string | null, email: string) {
  const source = name || email.split("@")[0];
  const parts = source.split(/[\s.\-_]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
function relTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  const diffD = diffH / 24;
  if (diffD < 7) return `${Math.floor(diffD)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface RowCheckboxProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}
function RowCheckbox({ checked, onChange, ariaLabel }: RowCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
        checked
          ? "border-text-primary bg-text-primary text-white"
          : "border-border bg-card hover:border-text-primary/40",
      )}
    >
      {checked && (
        <svg
          className="h-3 w-3"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 6.5L4.75 8.75L9.5 4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export default function PeopleTable({
  items,
  loading,
  onSelectPerson,
  onSelectConversation,
  selectedIds,
  onToggleSelected,
  selectedConversationIds,
  onToggleSelectedConversation,
  onToggleSelectAll,
  onMarkPersonRead,
  onMarkConversationRead,
}: PeopleTableProps) {
  // Person rows used for the bulk-select header checkbox + the stats strip.
  // Group rows are still rendered, just not eligible for bulk selection
  // (groups have their own per-row mark-read button).
  const people = useMemo(
    () => items.filter((it): it is GroupedPerson => it.type === "person"),
    [items],
  );
  const stats = useMemo(() => {
    let unread = 0;
    let withAttachments = 0;
    let multiInbox = 0;
    let groupCount = 0;
    for (const it of items) {
      if (it.type === "group") {
        unread += it.unreadCount;
        if (it.hasAttachment === 1) withAttachments++;
        groupCount++;
        continue;
      }
      unread += it.unreadCount;
      if (it.hasAttachment === 1) withAttachments++;
      if (it.recipientCount > 1) multiInbox++;
    }
    return {
      total: items.length,
      groupCount,
      unread,
      withAttachments,
      multiInbox,
    };
  }, [items]);

  // "All on page" = all persons selected AND all groups selected. Same
  // header checkbox flips both sets via onToggleSelectAll.
  const groups = useMemo(
    () => items.filter((it): it is GroupedConversation => it.type === "group"),
    [items],
  );
  const allPersonsSelected =
    people.length === 0 ||
    (selectedIds !== undefined && people.every((p) => selectedIds.has(p.id)));
  const allGroupsSelected =
    groups.length === 0 ||
    (selectedConversationIds !== undefined &&
      groups.every((g) => selectedConversationIds.has(g.id)));
  const allOnPageSelected =
    items.length > 0 &&
    selectedIds !== undefined &&
    allPersonsSelected &&
    allGroupsSelected;

  const someOnPageSelected =
    selectedIds !== undefined &&
    (people.some((p) => selectedIds.has(p.id)) ||
      (selectedConversationIds !== undefined &&
        groups.some((g) => selectedConversationIds.has(g.id)))) &&
    !allOnPageSelected;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Stats strip */}
      <div className="grid shrink-0 grid-cols-4 gap-px border-b border-border bg-border">
        <StatTile label="People" value={stats.total} />
        <StatTile label="Unread" value={stats.unread} accent />
        <StatTile label="Multi-inbox" value={stats.multiInbox} />
        <StatTile label="With attachments" value={stats.withAttachments} />
      </div>

      {/* Table */}
      <div className="smooth-scroll min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-text-primary">
              No people match your filters
            </p>
            <p className="text-xs font-light text-text-tertiary">
              Try clearing a filter or broadening your search.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm">
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                {selectedIds !== undefined && (
                  <th className="w-10 px-4 py-2.5">
                    <RowCheckbox
                      checked={allOnPageSelected}
                      onChange={() => onToggleSelectAll?.()}
                      ariaLabel={
                        allOnPageSelected
                          ? "Deselect all on page"
                          : "Select all on page"
                      }
                    />
                    {someOnPageSelected && (
                      <span className="sr-only">Some selected</span>
                    )}
                  </th>
                )}
                <th className="px-4 py-2.5 font-semibold">Person</th>
                <th className="px-3 py-2.5 font-semibold">Inboxes</th>
                <th className="px-3 py-2.5 text-right font-semibold">Emails</th>
                <th className="px-3 py-2.5 text-right font-semibold">Unread</th>
                <th className="px-3 py-2.5 text-right font-semibold">Last</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                if (item.type === "group") {
                  return (
                    <GroupTableRow
                      key={`g_${item.id}`}
                      group={item}
                      onSelect={() => onSelectConversation?.(item)}
                      onMarkRead={onMarkConversationRead}
                      hasCheckboxColumn={selectedIds !== undefined}
                      isSelected={
                        selectedConversationIds?.has(item.id) ?? false
                      }
                      onToggleSelected={onToggleSelectedConversation}
                    />
                  );
                }
                const person = item;
                const color = avatarColor(person.email);
                const isSelected = selectedIds?.has(person.id) ?? false;
                return (
                  <tr
                    key={person.id}
                    onClick={() => onSelectPerson(person)}
                    className={cn(
                      "group cursor-pointer border-b border-border/60 transition-colors",
                      isSelected
                        ? "bg-text-primary/[0.04]"
                        : "hover:bg-text-primary/[0.025]",
                    )}
                  >
                    {selectedIds !== undefined && (
                      <td className="w-10 px-4 py-2.5">
                        <RowCheckbox
                          checked={isSelected}
                          onChange={() => onToggleSelected?.(person.id)}
                          ariaLabel={`Select ${person.name || person.email}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: color.bg,
                            color: color.fg,
                          }}
                        >
                          {initials(person.name, person.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {person.name || person.email}
                          </p>
                          {person.name && (
                            <p className="truncate text-xs font-light text-text-tertiary">
                              {person.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(person.recipients ?? []).slice(0, 3).map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center rounded-[5px] bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                            title={r}
                          >
                            {r.split("@")[0]}
                          </span>
                        ))}
                        {(person.recipients?.length ?? 0) > 3 && (
                          <span className="inline-flex items-center rounded-[5px] px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
                            +{(person.recipients?.length ?? 0) - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-text-secondary">
                        {person.hasAttachment === 1 && (
                          <Paperclip
                            size={11}
                            className="text-text-tertiary"
                            aria-label="Has attachment"
                          />
                        )}
                        {person.totalCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {person.unreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkPersonRead?.(person.id);
                          }}
                          title="Mark all as read"
                          className="group/badge inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white transition-all hover:scale-110"
                          style={{ backgroundColor: "#7c5cfc" }}
                        >
                          <span className="group-hover/badge:hidden">
                            {person.unreadCount}
                          </span>
                          <CheckCheck
                            size={11}
                            className="hidden group-hover/badge:block"
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-light tabular-nums text-text-tertiary">
                        {relTime(person.lastEmailAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Solid palette for stacked group avatars — see GroupRow.tsx for the
// rationale (transparent overlapping circles look muddy).
const GROUP_AVATAR_PALETTE = [
  { bg: "#5b3ce6", fg: "#ffffff" },
  { bg: "#15803d", fg: "#ffffff" },
  { bg: "#be185d", fg: "#ffffff" },
  { bg: "#c2410c", fg: "#ffffff" },
  { bg: "#0369a1", fg: "#ffffff" },
  { bg: "#7e22ce", fg: "#ffffff" },
  { bg: "#0f766e", fg: "#ffffff" },
  { bg: "#a16207", fg: "#ffffff" },
];
function groupAvatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GROUP_AVATAR_PALETTE[h % GROUP_AVATAR_PALETTE.length];
}

interface GroupTableRowProps {
  group: GroupedConversation;
  onSelect: () => void;
  onMarkRead?: (id: string) => void;
  hasCheckboxColumn: boolean;
  isSelected?: boolean;
  onToggleSelected?: (id: string) => void;
}

/**
 * Table row for a group conversation. Avatar stack + comma-separated
 * names in the Person column; the conversation's inbox in the Inboxes
 * column. Bulk select skips groups (they have their own mark-read).
 */
function GroupTableRow({
  group,
  onSelect,
  onMarkRead,
  hasCheckboxColumn,
  isSelected = false,
  onToggleSelected,
}: GroupTableRowProps) {
  const visible = group.participants.slice(0, 3);
  const overflow = Math.max(0, group.participants.length - visible.length);
  const AVATAR = 28;
  const OVERLAP = 10;
  const stackWidth =
    AVATAR +
    Math.max(0, visible.length + (overflow > 0 ? 1 : 0) - 1) *
      (AVATAR - OVERLAP);
  const namesLine = group.participants
    .map((p) => {
      if (p.name && p.name.trim()) return p.name.trim().split(/\s+/)[0];
      return p.email.split("@")[0];
    })
    .slice(0, 4)
    .join(", ");
  const namesOverflow =
    group.participants.length - Math.min(4, group.participants.length);

  return (
    <tr
      onClick={onSelect}
      className={cn(
        "group cursor-pointer border-b border-border/60 transition-colors",
        isSelected ? "bg-text-primary/[0.04]" : "hover:bg-text-primary/[0.025]",
      )}
      data-testid="group-row"
      data-conversation-id={group.id}
    >
      {hasCheckboxColumn && (
        <td className="w-10 px-4 py-2.5">
          <RowCheckbox
            checked={isSelected}
            onChange={() => onToggleSelected?.(group.id)}
            ariaLabel={`Select group ${group.id}`}
          />
        </td>
      )}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className="relative shrink-0"
            style={{ width: stackWidth, height: AVATAR }}
          >
            {visible.map((p, i) => {
              const color = groupAvatarColor(p.email);
              return (
                <span
                  key={p.id}
                  title={p.name || p.email}
                  className="absolute flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: color.bg,
                    color: color.fg,
                    left: i * (AVATAR - OVERLAP),
                    top: 0,
                    zIndex: 10 - i,
                  }}
                >
                  {initials(p.name, p.email)}
                </span>
              );
            })}
            {overflow > 0 && (
              <span
                className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-bg-muted text-[10px] font-semibold text-text-secondary"
                style={{
                  left: visible.length * (AVATAR - OVERLAP),
                  top: 0,
                  zIndex: 10 - visible.length,
                }}
                title={`+${overflow} more participants`}
              >
                +{overflow}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text-primary">
              <Users size={11} className="shrink-0 text-text-tertiary" />
              <span className="truncate">
                {namesLine}
                {namesOverflow > 0 ? `, +${namesOverflow}` : ""}
              </span>
            </p>
            <p className="truncate text-xs font-light text-text-tertiary">
              {group.participants.length} participants
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className="inline-flex items-center rounded-[5px] bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary"
          title={group.inbox}
        >
          {group.inbox.split("@")[0]}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-text-secondary">
          {group.hasAttachment === 1 && (
            <Paperclip size={11} className="text-text-tertiary" />
          )}
          {group.totalCount}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        {group.unreadCount > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead?.(group.id);
            }}
            title="Mark all as read"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white transition-all hover:scale-110"
            style={{ backgroundColor: "#7c5cfc" }}
          >
            {group.unreadCount}
          </button>
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="text-xs font-light tabular-nums text-text-tertiary">
          {relTime(group.lastEmailAt)}
        </span>
      </td>
    </tr>
  );
}

interface StatTileProps {
  label: string;
  value: number;
  accent?: boolean;
}
function StatTile({ label, value, accent }: StatTileProps) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xl font-extrabold tabular-nums tracking-tight text-text-primary",
        )}
        style={accent && value > 0 ? { color: "#7c5cfc" } : undefined}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
