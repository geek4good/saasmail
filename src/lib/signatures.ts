/**
 * Helpers around the per-inbox HTML signature feature.
 *
 * - Storage of the "hide signatures in chat" preference (localStorage)
 * - HTML/text strippers used by the chat bubble when the toggle is on.
 *
 * The preference is intentionally client-only for now; if we ever want
 * cross-device sync we can move it to a /me endpoint without changing
 * the call sites.
 */

export const HIDE_SIGNATURES_STORAGE_KEY = "saasmail.hideSignaturesInChat";
/** Custom DOM event fired when the toggle changes — lets components in the
 * same tab react instantly without a full reload (the native `storage`
 * event only fires across tabs). */
export const HIDE_SIGNATURES_EVENT = "saasmail:hide-signatures-changed";

/** Returns the current preference. Defaults to false on read errors / SSR. */
export function readHideSignatures(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_SIGNATURES_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persists the preference and notifies same-tab listeners. */
export function writeHideSignatures(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDE_SIGNATURES_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* localStorage may be unavailable (private browsing) — non-fatal */
  }
  window.dispatchEvent(new CustomEvent(HIDE_SIGNATURES_EVENT));
}

/**
 * Strip the trailing signature block from an HTML email body. We look for
 * either a `<div data-signature>…</div>` (our own auto-attached marker) or
 * a `-- ` (RFC 3676) plain-text-style separator promoted to a block.
 */
export function stripSignatureFromHtml(html: string): string {
  if (!html) return html;
  // Cut anything from the first `<div data-signature` onward — that's
  // our marker for auto-attached signatures.
  const markerIdx = html.search(/<div[^>]*\bdata-signature\b/i);
  if (markerIdx >= 0) return html.slice(0, markerIdx).trimEnd();

  // Fallback: strip everything from a `-- ` separator at the start of a
  // block. Matches "<p>-- </p>" / "<p>--&nbsp;</p>" / "<br>-- ".
  const dashSepIdx = html.search(/<(p|div)[^>]*>\s*--(\s|&nbsp;|&#160;)/i);
  if (dashSepIdx >= 0) return html.slice(0, dashSepIdx).trimEnd();
  return html;
}

/** Same idea but for the plain-text body. */
export function stripSignatureFromText(text: string): string {
  if (!text) return text;
  // Standard "-- " line is the canonical email signature separator.
  const lines = text.split(/\r?\n/);
  const sepIdx = lines.findIndex((l) => l === "-- " || l === "--");
  if (sepIdx >= 0) {
    return lines.slice(0, sepIdx).join("\n").trimEnd();
  }
  return text;
}
