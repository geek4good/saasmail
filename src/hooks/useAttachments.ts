import { useState } from "react";

// Mirror of worker/src/lib/attachment-limits.ts — kept in sync manually.
// The backend is authoritative; these values must match.
const MAX_FILES = 10;
const MAX_TOTAL_MB = 25;

export { MAX_FILES, MAX_TOTAL_MB };

export function useAttachments() {
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const combined = [...attachments, ...picked].slice(0, MAX_FILES);
    const totalMB = combined.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
    if (totalMB > MAX_TOTAL_MB) {
      setError(`Attachments exceed ${MAX_TOTAL_MB} MB total limit`);
      e.target.value = "";
      return;
    }
    setAttachments(combined);
    setError("");
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments(attachments.filter((_, i) => i !== index));
  }

  function resetAttachments() {
    setAttachments([]);
    setError("");
  }

  return {
    attachments,
    error,
    handleFileChange,
    removeAttachment,
    resetAttachments,
  };
}
