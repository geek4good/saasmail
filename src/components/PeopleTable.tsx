import { useMemo } from "react";
import { Paperclip, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupedPerson } from "@/lib/api";

interface PeopleTableProps {
  people: GroupedPerson[];
  loading?: boolean;
  onSelectPerson: (person: GroupedPerson) => void;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  onToggleSelectAll?: () => void;
  onMarkPersonRead?: (id: string) => void;
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
  people,
  loading,
  onSelectPerson,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
  onMarkPersonRead,
}: PeopleTableProps) {
  const stats = useMemo(() => {
    let unread = 0;
    let withAttachments = 0;
    let multiInbox = 0;
    for (const p of people) {
      unread += p.unreadCount;
      if (p.hasAttachment === 1) withAttachments++;
      if (p.recipientCount > 1) multiInbox++;
    }
    return {
      total: people.length,
      unread,
      withAttachments,
      multiInbox,
    };
  }, [people]);

  const allOnPageSelected =
    people.length > 0 &&
    selectedIds !== undefined &&
    people.every((p) => selectedIds.has(p.id));

  const someOnPageSelected =
    selectedIds !== undefined &&
    people.some((p) => selectedIds.has(p.id)) &&
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
        ) : people.length === 0 ? (
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
              {people.map((person) => {
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
