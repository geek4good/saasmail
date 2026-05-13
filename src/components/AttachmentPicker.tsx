import { Paperclip } from "lucide-react";

interface AttachmentPickerProps {
  attachments: File[];
  error: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}

export default function AttachmentPicker({
  attachments,
  error,
  onFileChange,
  onRemove,
}: AttachmentPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-muted hover:text-text-primary">
        <Paperclip className="h-3.5 w-3.5" />
        Attach
        <input
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          className="sr-only"
          onChange={onFileChange}
        />
      </label>
      {attachments.map((f, i) => (
        <span
          key={`${f.name}-${f.size}-${i}`}
          className="flex items-center gap-1 rounded-[6px] bg-bg-muted px-2 py-0.5 text-xs text-text-primary ring-1 ring-border"
        >
          {f.name}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label={`Remove ${f.name}`}
          >
            ×
          </button>
        </span>
      ))}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
