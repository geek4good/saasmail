/**
 * Compute the deterministic `conversation_id` for a thread.
 *
 * The id is a hash of `<inbox>::<sorted-lowercased-external-emails>`.
 * Internal participants (those whose domain matches one of our
 * sender-identity domains) are filtered out by the caller — the input
 * here is the external set only.
 *
 * Returns NULL when the external set has fewer than 2 members. Those
 * threads are 1-on-1 (or all-internal) and the inbox list groups them
 * by person instead of by conversation.
 *
 * The same inbox + external set always hashes to the same id, so we
 * can stamp it on every message in the thread without coordination
 * between the inbound and outbound paths.
 */
export async function computeConversationId(
  inbox: string,
  externals: string[],
): Promise<string | null> {
  const norm = Array.from(
    new Set(externals.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ).sort();
  if (norm.length < 2) return null;
  const key = `${inbox.trim().toLowerCase()}::${norm.join("|")}`;
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `c_${hex.slice(0, 16)}`;
}

/**
 * Filter a list of email addresses down to "external" ones — those
 * whose domain is NOT in `internalDomains`. Used to derive the input
 * for `computeConversationId` from a (sender + recipient + cc) bag.
 */
export function externalsOnly(
  addresses: string[],
  internalDomains: string[],
): string[] {
  if (internalDomains.length === 0) return [...addresses];
  const internal = new Set(internalDomains.map((d) => d.toLowerCase()));
  return addresses.filter((a) => {
    const at = a.lastIndexOf("@");
    const dom = at === -1 ? "" : a.slice(at + 1).toLowerCase();
    return !internal.has(dom);
  });
}
