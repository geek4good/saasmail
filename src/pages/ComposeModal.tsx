import { useState, useEffect } from "react";
import { Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TiptapEditor from "@/components/TiptapEditor";
import { sendEmail, fetchStats } from "@/lib/api";
import { getFromLabel } from "@/lib/format";
import { useAttachments } from "@/hooks/useAttachments";

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ComposeModal({ open, onClose }: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [senderIdentities, setSenderIdentities] = useState<
    Array<{ email: string; displayName: string | null }>
  >([]);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const {
    attachments,
    error: attachmentError,
    handleFileChange,
    removeAttachment,
    resetAttachments,
  } = useAttachments();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // TipTap emits "<p></p>" for an empty editor — treat that as empty.
  const bodyIsEmpty = !bodyHtml || bodyHtml === "<p></p>";

  useEffect(() => {
    if (open) {
      fetchStats().then((stats) => {
        setRecipients(stats.recipients);
        setSenderIdentities(stats.senderIdentities ?? []);
        if (!fromAddress && stats.recipients.length > 0) {
          setFromAddress(stats.recipients[0]);
        }
      });
    } else {
      setTo("");
      setSubject("");
      setBodyHtml("");
      resetAttachments();
      setError("");
    }
  }, [open]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await sendEmail({ to, fromAddress, subject, bodyHtml, attachments });
      onClose();
    } catch {
      setError("Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-border bg-white text-text-primary sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Compose</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">
              From
            </label>
            <select
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              required
              className="h-8 w-full rounded-md border border-border bg-white ring-1 ring-gray-200 px-3 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {recipients.map((r) => (
                <option key={r} value={r}>
                  {getFromLabel(r, senderIdentities)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="compose-to"
              className="text-xs font-medium text-text-secondary"
            >
              To
            </label>
            <input
              id="compose-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              className="h-8 w-full rounded-md border border-border bg-white ring-1 ring-gray-200 px-3 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="compose-subject"
              className="text-xs font-medium text-text-secondary"
            >
              Subject
            </label>
            <input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="h-8 w-full rounded-md border border-border bg-white ring-1 ring-gray-200 px-3 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">
              Message
            </label>
            <div data-testid="compose-body" className="h-80">
              <TiptapEditor content={bodyHtml} onUpdate={setBodyHtml} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
              <Paperclip className="h-3.5 w-3.5" />
              Attach
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
            {attachments.map((f, i) => (
              <span
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-center gap-1 rounded bg-bg-muted px-2 py-0.5 text-xs text-text-primary"
              >
                {f.name}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-text-tertiary hover:text-text-primary transition-colors"
                  aria-label={`Remove ${f.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {(error || attachmentError) && (
            <p className="text-xs text-destructive">{error || attachmentError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-muted hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="compose-send-button"
              disabled={sending || bodyIsEmpty}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
