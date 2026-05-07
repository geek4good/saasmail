import { useState, useRef, useEffect } from "react";
import { replyToEmail, sendEmail } from "@/lib/api";

interface ChatQuickReplyProps {
  inboxAddress: string; // From address, fixed to this section's inbox
  latestReceivedEmailId: string | null; // What we reply to; if null, send as new email
  personEmail: string; // Recipient address when no reply target exists
  onSent: () => void; // Refetch + scroll
}

// Wrap user-entered plain text into the minimal HTML the existing reply route
// requires (it 400s without bodyHtml or templateSlug).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(text: string): string {
  const lines = text.split(/\r?\n/);
  return lines
    .map((line) =>
      line.length === 0 ? "<p>&nbsp;</p>" : `<p>${escapeHtml(line)}</p>`,
    )
    .join("");
}

export default function ChatQuickReply({
  inboxAddress,
  latestReceivedEmailId,
  personEmail,
  onSent,
}: ChatQuickReplyProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: set height to scrollHeight, clamped to ~6 lines (~ 132px).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const max = 132;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text]);

  const canSend = text.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      if (latestReceivedEmailId) {
        await replyToEmail(latestReceivedEmailId, {
          bodyHtml: plainTextToHtml(text),
          bodyText: text,
          fromAddress: inboxAddress,
        });
      } else {
        await sendEmail({
          to: personEmail,
          fromAddress: inboxAddress,
          subject: "(no subject)",
          bodyHtml: plainTextToHtml(text),
          bodyText: text,
        });
      }
      setText("");
      onSent();
    } catch (e) {
      setError("Failed to send message");
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter inserts a newline (default). Cmd/Ctrl+Enter sends.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex items-end gap-2 rounded-[10px] bg-bg-subtle/60 p-2 ring-1 ring-border focus-within:ring-2 focus-within:ring-text-primary/15">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            latestReceivedEmailId ? "Type a reply…" : "Type a message…"
          }
          className="flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:text-text-tertiary"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 rounded-[8px] bg-text-primary px-3.5 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : (
          <span className="text-[11px] font-light text-text-tertiary">
            Sending from <span className="font-medium">{inboxAddress}</span> ·
            ⌘/Ctrl + Enter to send
          </span>
        )}
      </div>
    </div>
  );
}
