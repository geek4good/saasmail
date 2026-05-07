import { useEffect, useRef, useState } from "react";
import { ChevronDown, Inbox, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InboxFilters {
  recipient?: string;
  unread?: boolean;
  hasAttachment?: boolean;
}

interface InboxOption {
  email: string;
  displayName?: string | null;
}

interface InboxFilterBarProps {
  filters: InboxFilters;
  onChange: (next: InboxFilters) => void;
  inboxes: InboxOption[];
}

function inboxLabel(o: InboxOption) {
  return o.displayName || o.email.split("@")[0] || o.email;
}

export default function InboxFilterBar({
  filters,
  onChange,
  inboxes,
}: InboxFilterBarProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const activeInbox = inboxes.find((i) => i.email === filters.recipient);
  const activeLabel = activeInbox ? inboxLabel(activeInbox) : "All inboxes";
  const hasActiveFilters =
    !!filters.recipient || !!filters.unread || !!filters.hasAttachment;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        Filter
      </span>

      {/* Inbox dropdown */}
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition-colors",
            filters.recipient
              ? "border-text-primary/15 bg-text-primary/[0.04] text-text-primary"
              : "border-border bg-card text-text-secondary hover:bg-bg-muted hover:text-text-primary",
          )}
        >
          <Inbox size={12} />
          {activeLabel}
          <ChevronDown size={12} className="opacity-60" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-[8px] border border-border bg-card py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onChange({ ...filters, recipient: undefined });
                setOpen(false);
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
                      onChange({ ...filters, recipient: inbox.email });
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-bg-muted",
                      active && "bg-bg-subtle font-medium",
                    )}
                  >
                    <div className="flex flex-col items-start min-w-0">
                      <span className="truncate text-text-primary">
                        {inboxLabel(inbox)}
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

      {/* Toggle chips */}
      <FilterChip
        label="Unread only"
        active={!!filters.unread}
        onToggle={() => onChange({ ...filters, unread: !filters.unread })}
      />
      <FilterChip
        label="Has attachments"
        active={!!filters.hasAttachment}
        onToggle={() =>
          onChange({ ...filters, hasAttachment: !filters.hasAttachment })
        }
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() =>
            onChange({
              recipient: undefined,
              unread: false,
              hasAttachment: false,
            })
          }
          className="ml-1 inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-medium text-text-tertiary transition-colors hover:bg-bg-muted hover:text-text-primary"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}
function FilterChip({ label, active, onToggle }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-text-primary/15 bg-text-primary/[0.04] text-text-primary"
          : "border-border bg-card text-text-secondary hover:bg-bg-muted hover:text-text-primary",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors",
          active ? "bg-violet" : "bg-text-tertiary/30",
        )}
        style={active ? { backgroundColor: "#7c5cfc" } : undefined}
        aria-hidden
      />
      {label}
    </button>
  );
}
