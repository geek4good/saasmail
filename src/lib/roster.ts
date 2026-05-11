import type { CcEntry, Email } from "@/lib/api";

/**
 * Parse a comma-separated address string. Tolerates display names
 * wrapping the address ("Alice <alice@x.com>") by extracting the
 * angle-bracketed address when present.
 */
function parseAddressList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const lt = trimmed.lastIndexOf("<");
      const gt = trimmed.lastIndexOf(">");
      if (lt !== -1 && gt !== -1 && gt > lt) {
        return trimmed.slice(lt + 1, gt).trim();
      }
      return trimmed;
    })
    .filter(Boolean);
}

export type SenderResolver = (
  email: Email,
) => { email: string; name: string | null } | null;

/**
 * Full participant roster for a single email — includes the sender,
 * the primary recipient(s), and everyone CC'd, deduplicated by
 * lowercased email.
 *
 * Why this matters for roster diffs: a participant who's the *sender*
 * of a given message naturally isn't in their own `cc[]`. If we diff
 * just CC arrays across consecutive messages, every speaker rotation
 * reads as "X removed · Y added" — a bug. Diffing full rosters makes
 * the speaker rotation cancel out so we only flag genuine joins/leaves.
 *
 * Received emails have `fromAddress: null` and `toAddress: null` on
 * the wire (sender is carried via `personId`, recipient via
 * `recipient`). Pass `senderResolver` so we can recover the sender
 * for received messages — without it, the speaker still won't appear
 * in the roster and the bug recurs.
 */
export function rosterOf(
  email: Email,
  senderResolver?: SenderResolver,
): CcEntry[] {
  const out: CcEntry[] = [];
  const seen = new Set<string>();
  const push = (addr: string | null | undefined, name?: string | null) => {
    if (!addr) return;
    const key = addr.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ email: addr, name: name ?? null });
  };

  if (email.type === "sent") {
    push(email.fromAddress);
    for (const a of parseAddressList(email.toAddress)) push(a);
  } else {
    // Received: sender lives behind personId; recipient is the inbox.
    const sender = senderResolver?.(email);
    if (sender) push(sender.email, sender.name);
    else if (email.fromAddress) push(email.fromAddress);
    push(email.recipient);
  }
  for (const c of email.cc ?? []) push(c.email, c.name);
  return out;
}

/**
 * Diff two rosters. Returns the entries that joined (in `next` but
 * not `prev`) and left (in `prev` but not `next`). Comparison is
 * case-insensitive on email.
 */
export function diffRosters(
  prev: CcEntry[],
  next: CcEntry[],
): { joined: CcEntry[]; left: CcEntry[] } {
  const prevSet = new Set(prev.map((c) => c.email.toLowerCase()));
  const nextSet = new Set(next.map((c) => c.email.toLowerCase()));
  const joined = next.filter((c) => !prevSet.has(c.email.toLowerCase()));
  const left = prev.filter((c) => !nextSet.has(c.email.toLowerCase()));
  return { joined, left };
}
