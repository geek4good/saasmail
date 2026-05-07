import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Inbox,
  X,
  Search,
  LayoutList,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface InboxFilters {
  recipient?: string;
  unread?: boolean;
  hasAttachment?: boolean;
}

export type InboxView = "list" | "table";

interface InboxOption {
  email: string;
  displayName?: string | null;
}

interface InboxToolbarProps {
  filters: InboxFilters;
  onFiltersChange: (next: InboxFilters) => void;
  inboxes: InboxOption[];
  search: string;
  onSearchChange: (q: string) => void;
  view: InboxView;
  onViewChange: (v: InboxView) => void;
}

function inboxOptionLabel(o: InboxOption) {
  return o.displayName || o.email.split("@")[0] || o.email;
}

export default function InboxToolbar({
  filters,
  onFiltersChange,
  inboxes,
  search,
  onSearchChange,
  view,
  onViewChange,
}: InboxToolbarProps) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!inboxOpen) return;
    function close(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setInboxOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [inboxOpen]);

  const activeInbox = inboxes.find((i) => i.email === filters.recipient);
  const activeLabel = activeInbox
    ? inboxOptionLabel(activeInbox)
    : "All inboxes";
  const hasActiveFilters =
    !!filters.recipient || !!filters.unread || !!filters.hasAttachment;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-[10px] bg-card p-1.5 ring-1 ring-border">
      {/* Search — borderless inside the unified bar. On mobile takes full
          width, on desktop sits inline with filters. */}
      <div className="relative w-full min-w-[180px] flex-1 sm:w-auto sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input
          data-testid="person-search-input"
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 w-full rounded-[6px] border-0 bg-transparent pl-9 pr-8 text-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-text-primary/15 sm:h-8 sm:pl-8 sm:pr-7 sm:text-sm"
        />
        {search && (
          <button
            data-testid="person-search-clear"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary"
            aria-label="Clear search"
          >
            <X className="h-4 w-4 sm:h-3 sm:w-3" />
          </button>
        )}
      </div>

      {/* Vertical divider — desktop only */}
      <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden />

      {/* Inbox dropdown — ghost button inside bar */}
      <div ref={wrapRef} className="relative">
        <ToolbarButton
          active={!!filters.recipient}
          onClick={() => setInboxOpen((v) => !v)}
        >
          <Inbox size={12} />
          {activeLabel}
          <ChevronDown size={12} className="opacity-60" />
        </ToolbarButton>
        {inboxOpen && (
          <div className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-[8px] border border-border bg-card py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onFiltersChange({ ...filters, recipient: undefined });
                setInboxOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-bg-muted",
                !filters.recipient && "bg-bg-subtle font-medium",
              )}
            >
              <span>All inboxes</span>
              {!filters.recipient && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                  active
                </span>
              )}
            </button>
            <div className="my-1 h-px bg-border" />
            {inboxes.length === 0 ? (
              <p className="px-3 py-2 text-xs font-light text-text-tertiary">
                No inboxes available
              </p>
            ) : (
              inboxes.map((inbox) => {
                const active = filters.recipient === inbox.email;
                return (
                  <button
                    key={inbox.email}
                    type="button"
                    onClick={() => {
                      onFiltersChange({ ...filters, recipient: inbox.email });
                      setInboxOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-bg-muted",
                      active && "bg-bg-subtle font-medium",
                    )}
                  >
                    <div className="flex min-w-0 flex-col items-start">
                      <span className="truncate text-text-primary">
                        {inboxOptionLabel(inbox)}
                      </span>
                      <span className="truncate text-[10px] font-light text-text-tertiary">
                        {inbox.email}
                      </span>
                    </div>
                    {active && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                        active
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <ToolbarToggle
        label="Unread"
        active={!!filters.unread}
        onClick={() => onFiltersChange({ ...filters, unread: !filters.unread })}
      />
      <ToolbarToggle
        label="Attachments"
        active={!!filters.hasAttachment}
        onClick={() =>
          onFiltersChange({
            ...filters,
            hasAttachment: !filters.hasAttachment,
          })
        }
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() =>
            onFiltersChange({
              recipient: undefined,
              unread: false,
              hasAttachment: false,
            })
          }
          className="inline-flex h-8 items-center gap-1 rounded-[6px] px-2 text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary"
        >
          <X size={12} />
          Clear
        </button>
      )}

      {/* View toggle — pinned to the right edge. Hidden on mobile (the
          table view is unusable at narrow widths). */}
      <span className="ml-auto" />
      <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden />
      <div className="hidden h-8 rounded-[6px] bg-bg-muted/70 p-0.5 sm:inline-flex">
        <ViewToggleButton
          icon={LayoutList}
          label="List"
          active={view === "list"}
          onClick={() => onViewChange("list")}
        />
        <ViewToggleButton
          icon={LayoutGrid}
          label="Table"
          active={view === "table"}
          onClick={() => onViewChange("table")}
        />
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}
function ToolbarButton({ active, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-text-primary/[0.06] text-text-primary"
          : "text-text-secondary hover:bg-bg-muted hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

interface ToolbarToggleProps {
  label: string;
  active: boolean;
  onClick: () => void;
}
function ToolbarToggle({ label, active, onClick }: ToolbarToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-text-primary/[0.06] text-text-primary"
          : "text-text-secondary hover:bg-bg-muted hover:text-text-primary",
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full transition-colors"
        style={{ backgroundColor: active ? "#7c5cfc" : "rgba(0,0,0,0.18)" }}
        aria-hidden
      />
      {label}
    </button>
  );
}

interface ViewToggleButtonProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}
function ViewToggleButton({
  icon: Icon,
  label,
  active,
  onClick,
}: ViewToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} view`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-all",
        active
          ? "bg-card text-text-primary shadow-sm ring-1 ring-border/60"
          : "text-text-secondary hover:text-text-primary",
      )}
    >
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
