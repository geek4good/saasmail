import { useState, useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Paperclip,
  Download,
  Copy,
  CheckCircle2,
  Inbox as InboxIcon,
  Send,
  Hash,
  Calendar,
  AtSign,
  FileText,
  Code,
} from "lucide-react";
import { sanitizeEmailHtml } from "@/lib/sanitize-html";
import type { Email } from "@/lib/api";
import { cn } from "@/lib/utils";

interface EmailHtmlModalProps {
  email: Email | null;
  open: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function avatarInitial(addr: string | null): string {
  if (!addr) return "?";
  return addr[0]?.toUpperCase() ?? "?";
}

function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const palette = [
    { bg: "rgba(124, 92, 252, 0.14)", fg: "#5b3ce6" },
    { bg: "rgba(34, 197, 94, 0.14)", fg: "#15803d" },
    { bg: "rgba(244, 114, 182, 0.16)", fg: "#be185d" },
    { bg: "rgba(56, 189, 248, 0.16)", fg: "#0369a1" },
    { bg: "rgba(168, 85, 247, 0.14)", fg: "#7e22ce" },
  ];
  return palette[h % palette.length];
}

interface DetailRowProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  monospace?: boolean;
}
function DetailRow({ icon: Icon, label, value, monospace }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-baseline gap-3 py-1">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        <Icon size={11} />
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 break-words text-sm text-text-primary",
          monospace && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default function EmailHtmlModal({
  email,
  open,
  onClose,
}: EmailHtmlModalProps) {
  const [view, setView] = useState<"rendered" | "plain">("rendered");
  const [copied, setCopied] = useState(false);

  // Reset internal state when the email changes
  useMemo(() => {
    setView("rendered");
    setCopied(false);
  }, [email?.id]);

  if (!email) return null;

  const isSent = email.type === "sent";
  const downloadable = (email.attachments ?? []).filter((a) => !a.contentId);
  const fromAddr = isSent ? email.fromAddress : email.fromAddress;
  const toAddr = isSent ? email.toAddress : email.recipient;
  const senderForAvatar = isSent ? "you" : (fromAddr ?? email.recipient ?? "?");
  const color = avatarColor(senderForAvatar);

  const ts = new Date(email.timestamp * 1000);
  const fullDate = ts.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const fullTime = ts.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const plainText =
    email.bodyText ||
    (email.bodyHtml
      ? (new DOMParser().parseFromString(email.bodyHtml, "text/html").body
          .textContent ?? "")
      : "");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="drawer-content fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-card shadow-2xl ring-1 ring-border focus:outline-none sm:max-w-[680px]">
          {/* Header */}
          <div className="shrink-0 border-b border-border bg-card px-6 pb-4 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ backgroundColor: color.bg, color: color.fg }}
                >
                  {avatarInitial(senderForAvatar)}
                </span>
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="truncate text-lg font-extrabold tracking-tight text-text-primary">
                    {email.subject || "(no subject)"}
                  </DialogPrimitive.Title>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        isSent
                          ? "bg-bg-muted text-text-secondary"
                          : "bg-violet/10",
                      )}
                      style={!isSent ? { color: "#7c5cfc" } : undefined}
                    >
                      {isSent ? <Send size={10} /> : <InboxIcon size={10} />}
                      {isSent ? "Sent" : "Received"}
                    </span>
                    <span className="font-light text-text-tertiary">
                      {fullDate} · {fullTime}
                    </span>
                  </div>
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

          {/* Metadata */}
          <div className="shrink-0 border-b border-border bg-bg-subtle/40 px-6 py-3">
            <DetailRow
              icon={AtSign}
              label="From"
              value={fromAddr || (isSent ? "you" : "—")}
            />
            <DetailRow icon={Send} label="To" value={toAddr || "—"} />
            <DetailRow icon={Hash} label="ID" value={email.id} monospace />
            <DetailRow
              icon={Calendar}
              label="Time"
              value={ts.toISOString()}
              monospace
            />
          </div>

          {/* Attachments */}
          {downloadable.length > 0 && (
            <div className="shrink-0 border-b border-border bg-card px-6 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {downloadable.length} attachment
                {downloadable.length !== 1 ? "s" : ""}
              </p>
              <ul className="space-y-1.5">
                {downloadable.map((att) => (
                  <li key={att.id}>
                    <a
                      href={`/api/attachments/${att.id}`}
                      className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-card px-3 py-2 text-xs transition-colors hover:bg-bg-muted"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip
                          size={14}
                          className="shrink-0 text-text-tertiary"
                        />
                        <span className="truncate font-medium text-text-primary">
                          {att.filename}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-text-tertiary">
                        <span>{formatBytes(att.size)}</span>
                        <Download size={12} />
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Body view toggle + actions */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-6 py-2.5">
            <div className="inline-flex rounded-[8px] bg-bg-muted/70 p-0.5 ring-1 ring-border">
              <button
                onClick={() => setView("rendered")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-xs font-medium transition-all",
                  view === "rendered"
                    ? "bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <FileText size={12} />
                Rendered
              </button>
              <button
                onClick={() => setView("plain")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-xs font-medium transition-all",
                  view === "plain"
                    ? "bg-card text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Code size={12} />
                Plain text
              </button>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={12} className="text-success" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={12} />
                  Copy text
                </>
              )}
            </button>
          </div>

          {/* Body */}
          <div className="smooth-scroll min-h-0 flex-1 overflow-y-auto bg-card">
            {view === "rendered" && email.bodyHtml ? (
              <div
                className="prose prose-sm max-w-none px-8 py-6 text-text-primary [&_a]:text-violet [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_p]:my-2"
                style={{ "--tw-prose-links": "#7c5cfc" } as React.CSSProperties}
                dangerouslySetInnerHTML={{
                  __html: sanitizeEmailHtml(email.bodyHtml),
                }}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words px-8 py-6 font-sans text-sm leading-relaxed text-text-primary">
                {plainText || "(empty)"}
              </pre>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border bg-bg-subtle/40 px-6 py-2.5">
            <p className="text-[11px] font-light text-text-tertiary">
              Original message · Press{" "}
              <kbd className="rounded border border-border bg-card px-1 text-[10px] font-medium text-text-secondary">
                Esc
              </kbd>{" "}
              to close
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
