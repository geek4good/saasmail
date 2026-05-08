/**
 * Generate seeds/demo.sql with realistic demo data:
 *   - 6 inboxes (kept stable so admin display-name UI works)
 *   - 100 people
 *   - 600-900 inbound emails (varied length, varied subject, ~25% unread)
 *   - 80-150 sent replies
 *   - CC roster (~20% of emails) + 5 roster-change demo threads
 *   - Attachments on ~15% of inbound emails (real fake fixtures)
 *
 * Run:  npx tsx seeds/generate-demo.ts
 * Then: yarn db:seed:dev
 */
import { createHash } from "node:crypto";
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Reproducible RNG so re-runs give the same dataset.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const rand = makeRng(1759);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  while (n > 0 && copy.length) {
    result.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    n--;
  }
  return result;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function chance(p: number): boolean {
  return rand() < p;
}
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Inboxes
// ---------------------------------------------------------------------------
const INBOXES = [
  { email: "support@example.com", display: "Support" },
  { email: "sales@example.com", display: "Sales" },
  { email: "hello@example.com", display: "General" },
  { email: "billing@example.com", display: "Billing" },
  { email: "newsletter@example.com", display: "Newsletter" },
  { email: "notifications@example.com", display: "Notifications" },
];

// ---------------------------------------------------------------------------
// Name + domain pools (stay short — total combos are still huge)
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Carla",
  "Dan",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Iris",
  "Jack",
  "Kim",
  "Leo",
  "Maya",
  "Noah",
  "Olivia",
  "Pavel",
  "Quinn",
  "Rosa",
  "Sam",
  "Tara",
  "Uma",
  "Victor",
  "Wendy",
  "Xavier",
  "Yuki",
  "Zane",
  "Amir",
  "Bella",
  "Caleb",
  "Diana",
  "Emil",
  "Faye",
  "Gabriel",
  "Hana",
  "Idris",
  "Jana",
  "Karim",
  "Lena",
  "Marcus",
  "Nadia",
  "Owen",
  "Priya",
  "Rafael",
  "Sofia",
  "Tariq",
  "Vera",
  "Will",
  "Yara",
  "Zaid",
  "Anya",
  "Bruno",
  "Chloe",
  "Diego",
  "Elsa",
  "Felix",
  "Gemma",
  "Hugo",
  "Indra",
  "Julian",
  "Kira",
  "Lucas",
  "Mira",
  "Nico",
  "Omar",
  "Petra",
  "Reina",
  "Said",
  "Tina",
  "Ulrich",
  "Vivi",
  "Wei",
  "Xiu",
  "Yannis",
  "Zara",
];
const LAST_NAMES = [
  "Nguyen",
  "Martinez",
  "Schmidt",
  "Park",
  "Johansson",
  "Liu",
  "Okafor",
  "Wayne",
  "Chen",
  "Prince",
  "Novak",
  "Halat",
  "Patel",
  "Tanaka",
  "Kowalski",
  "Singh",
  "Rossi",
  "Garcia",
  "Khan",
  "Müller",
  "Andersson",
  "Iyer",
  "Reyes",
  "Diaz",
  "Cohen",
  "Abadi",
  "Fischer",
  "Yamamoto",
  "O'Brien",
  "Walsh",
  "Cruz",
  "Brennan",
  "Yusupov",
  "Santos",
  "Petrov",
  "Nakamura",
  "Kim",
  "Bauer",
  "Volkov",
  "Hassan",
  "Ferreira",
  "Lindgren",
  "Mendez",
  "Sato",
];
const DOMAINS = [
  "acme.co",
  "globex.io",
  "initech.dev",
  "hooli.com",
  "piedpiper.ai",
  "soylent.corp",
  "dundermifflin.com",
  "wayne.enterprises",
  "northwind.co",
  "stark.industries",
  "umbrella.med",
  "tyrell.tech",
  "weyland.space",
  "aperture.science",
  "vandelay.imp",
  "orbis.health",
];

// ---------------------------------------------------------------------------
// CC pools — internal team uses our own domain, external collaborators
// pull from existing DOMAINS plus a couple of new business domains.
// ---------------------------------------------------------------------------
type CcEntry = { email: string; name?: string | null };

const INTERNAL_TEAM: CcEntry[] = [
  { email: "lin@example.com", name: "Lin Park" },
  { email: "pavel@example.com", name: "Pavel Novak" },
  { email: "maya@example.com", name: "Maya Iyer" },
  { email: "diego@example.com", name: "Diego Cruz" },
  { email: "ren@example.com", name: "Ren O'Brien" },
  { email: "sam@example.com", name: "Sam Liu" },
];

const EXTERNAL_COLLABORATORS: CcEntry[] = [
  { email: "carla.martinez@acme.co", name: "Carla Martinez" },
  { email: "bob.schmidt@globex.io", name: "Bob Schmidt" },
  { email: "rosa.garcia@initech.dev", name: "Rosa Garcia" },
  { email: "henry.wayne@hooli.com", name: "Henry Wayne" },
  { email: "kim.chen@piedpiper.ai", name: "Kim Chen" },
  { email: "olivia.prince@stark.industries", name: "Olivia Prince" },
  { email: "tariq.khan@legal.acme.co", name: "Tariq Khan" },
  { email: "priya.singh@procurement.globex.io", name: "Priya Singh" },
  { email: "marcus.cohen@northwind.co", name: "Marcus Cohen" },
  { email: "yuki.sato@orbis.health", name: "Yuki Sato" },
];

// ---------------------------------------------------------------------------
// GROUP_THREADS — explicit multi-participant fixtures. Each one becomes a
// chain of inbound + outbound messages stamped with the same conversation_id.
//
// `from` = index into `externals` for an inbound message, or "us" for an
// outbound reply from our team. `roster` overrides who's CC'd on THIS
// specific message; default roster = all other externals + internalCcs.
// ---------------------------------------------------------------------------
type GroupExternal = { email: string; name: string };
type GroupMessage = {
  from: number | "us";
  text: string;
  daysAgo: number;
  roster?: number[]; // indexes into externals to CC on this message specifically
};
type GroupThread = {
  inbox: string;
  externals: GroupExternal[];
  internalCcs: string[]; // emails picked from INTERNAL_TEAM
  subject: string;
  messages: GroupMessage[];
};

const GROUP_THREADS: GroupThread[] = [
  // 1) Billing dispute — invoice line items
  {
    inbox: "billing@example.com",
    externals: [
      { email: "elena.varga@acme.co", name: "Elena Varga" },
      { email: "tomas.reiner@acme.co", name: "Tomas Reiner" },
      { email: "fiona.boyle@legal.acme.co", name: "Fiona Boyle" },
    ],
    internalCcs: ["pavel@example.com", "lin@example.com"],
    subject: "September invoice — line item discrepancy",
    messages: [
      {
        from: 0,
        text: "Hi team — our September invoice came in $1,840 above last month and we can't reconcile the overage line. Can someone walk us through how the seat-add prorations were calculated? Looping in Tomas from finance.",
        daysAgo: 12,
      },
      {
        from: 1,
        text: "Adding context from finance: we added 12 seats on Sep 9 and 6 more on Sep 22. Both moves should have prorated against the annual term, not been billed at full month.",
        daysAgo: 12,
      },
      {
        from: "us",
        text: "Thanks both — pulling the breakdown now. Quick check: is your plan on the legacy annual rate or the Sep 1 refresh? That changes the proration formula.",
        daysAgo: 11,
      },
      {
        from: 0,
        text: "Legacy annual, signed in March. Happy to forward the contract if helpful.",
        daysAgo: 11,
      },
      {
        from: "us",
        text: "Got it — confirmed the seat-adds were billed under the new formula by mistake. I'm issuing a credit of $1,290 to bring this in line with the legacy rate. Should appear on next month's invoice.",
        daysAgo: 9,
      },
      {
        from: 2,
        text: "Hi all — Fiona from Acme legal, just looped in. Before we close this out, can we get the credit memo in writing? Our auditors flag verbal credits.",
        daysAgo: 9,
        // Fiona joins late — roster expands.
        roster: [0, 1, 2],
      },
      {
        from: "us",
        text: "Of course. Issuing the credit memo today; you'll get it as a PDF attachment from finance@. Sorry about the runaround.",
        daysAgo: 8,
        roster: [0, 1, 2],
      },
      {
        from: 0,
        text: "Received and confirmed. Thanks for the quick turnaround — closing this out on our end.",
        daysAgo: 7,
        roster: [0, 1, 2],
      },
    ],
  },
  // 2) Legal review — DPA redlines
  {
    inbox: "sales@example.com",
    externals: [
      { email: "harriet.cole@hooli.com", name: "Harriet Cole" },
      { email: "darius.weiss@hooli.com", name: "Darius Weiss" },
      { email: "marina.flores@legal.acme.co", name: "Marina Flores" },
    ],
    internalCcs: ["ren@example.com"],
    subject: "DPA redlines for Hooli expansion",
    messages: [
      {
        from: 0,
        text: "Sending over our redlines on the DPA for the expansion order. Most of the changes are in section 4 (sub-processors) and section 9 (audit rights). Marina from outside counsel is CC'd.",
        daysAgo: 14,
      },
      {
        from: "us",
        text: "Thanks Harriet — taking a look with our legal team today. First read: section 4 looks fine, section 9 we'll likely push back on the unannounced audit clause.",
        daysAgo: 14,
      },
      {
        from: 2,
        text: "Hi — Marina here. The unannounced audit clause is non-negotiable for our regulated customers, but we can scope it to a 30-day notice for non-regulated tenants. Would that work?",
        daysAgo: 13,
      },
      {
        from: "us",
        text: "30-day notice works on our side. We'll mark up section 9 with that compromise and send it back tomorrow.",
        daysAgo: 13,
      },
      {
        from: 1,
        text: "Jumping in — Darius from procurement at Hooli. Once legal aligns, I'll need the final DPA in our vendor portal before we can countersign the order form. Just flagging the dependency.",
        daysAgo: 12,
        // Darius added — roster grows.
        roster: [0, 1, 2],
      },
      {
        from: "us",
        text: "Acknowledged — we'll upload directly to your portal once it's signed. Latest redline attached.",
        daysAgo: 11,
        roster: [0, 1, 2],
      },
      {
        from: 2,
        text: "Reviewed. One small edit on the sub-processor list (we're flagging Resend as a notification trigger only, not a primary processor). Otherwise good to sign.",
        daysAgo: 9,
        roster: [0, 1, 2],
      },
      {
        from: "us",
        text: "Edit accepted. Sending the clean version for signature now.",
        daysAgo: 8,
        roster: [0, 1, 2],
      },
      {
        from: 0,
        text: "Signed and uploaded. Order form follows in a separate thread.",
        daysAgo: 6,
        roster: [0, 1, 2],
      },
    ],
  },
  // 3) Feature negotiation — SAML SSO scope
  {
    inbox: "sales@example.com",
    externals: [
      { email: "rajiv.kapur@piedpiper.ai", name: "Rajiv Kapur" },
      { email: "sienna.holt@piedpiper.ai", name: "Sienna Holt" },
      { email: "noor.haddad@piedpiper.ai", name: "Noor Haddad" },
    ],
    internalCcs: ["maya@example.com", "diego@example.com"],
    subject: "SAML SSO requirements for Q1 rollout",
    messages: [
      {
        from: 0,
        text: "We're targeting a Q1 rollout. Need to confirm SAML SSO covers SCIM provisioning, JIT user creation, and per-inbox group mapping. Sienna and Noor from our security team are CC'd.",
        daysAgo: 18,
      },
      {
        from: "us",
        text: "All three are supported on Enterprise. SCIM via Okta/Azure, JIT is on by default, and group mapping is per-tenant configurable. Happy to walk through the admin UI on a call.",
        daysAgo: 18,
      },
      {
        from: 1,
        text: "Quick clarification on JIT: when a user is deprovisioned upstream, how fast does access revoke on your side? We need < 5 minute SLA for SOC 2.",
        daysAgo: 17,
      },
      {
        from: "us",
        text: "SCIM events propagate within 2 minutes typically, hard cap is 5 minutes by SLA. We can share the SOC 2 Type II report under NDA if helpful.",
        daysAgo: 17,
      },
      {
        from: 2,
        text: "Yes please on the SOC 2 report. Also — what's the disaster-recovery story for the SAML metadata itself? If your IdP-facing endpoint goes down, do we get cached metadata?",
        daysAgo: 16,
      },
      {
        from: "us",
        text: "Metadata is cached at the edge with a 24h TTL. If the origin is unreachable, in-flight sessions stay valid until natural expiry. Sending the SOC 2 report via secure share now.",
        daysAgo: 15,
      },
      {
        from: 0,
        text: "Received. Looks good on our end. One more thing — can we get a sandbox tenant to test the SCIM bridge before we cutover?",
        daysAgo: 13,
      },
      {
        from: "us",
        text: "Sandbox is provisioned: pp-sandbox.example.com. Credentials in the secure share. Ping us if you hit any issues.",
        daysAgo: 12,
      },
      {
        from: 1,
        text: "Tested SCIM — works. We're moving forward with the Q1 plan. Will send the signed order form tomorrow.",
        daysAgo: 8,
      },
    ],
  },
  // 4) Procurement check — vendor security questionnaire
  {
    inbox: "sales@example.com",
    externals: [
      { email: "priya.singh@procurement.globex.io", name: "Priya Singh" },
      { email: "kenji.yamada@globex.io", name: "Kenji Yamada" },
    ],
    internalCcs: ["pavel@example.com"],
    subject: "Vendor security questionnaire",
    messages: [
      {
        from: 0,
        text: "Hi — Priya from Globex procurement. Attaching our vendor security questionnaire (97 questions, sorry). Need it back by EOW to keep the renewal on track.",
        daysAgo: 9,
      },
      {
        from: "us",
        text: "Got it — most of these we can copy from our existing trust portal. Will turn around by Thursday.",
        daysAgo: 9,
      },
      {
        from: 1,
        text: "Adding our InfoSec lead Kenji to the thread. He'll review the responses before they go to legal.",
        daysAgo: 8,
        roster: [0, 1],
      },
      {
        from: "us",
        text: "Welcome Kenji. Filled questionnaire attached. Highlights: SOC 2 Type II current, ISO 27001 in progress (cert expected Q2), pen test report from August available under NDA.",
        daysAgo: 7,
        roster: [0, 1],
      },
      {
        from: 1,
        text: "Reviewed. Two follow-ups: question 47 on encryption-at-rest needs the KMS provider name, and question 82 on incident response wants the on-call rotation size.",
        daysAgo: 6,
        roster: [0, 1],
      },
      {
        from: "us",
        text: "47: AWS KMS, customer-managed keys available on Enterprise. 82: 6-engineer on-call rotation, 24/7 coverage with < 15min P1 ack SLA.",
        daysAgo: 6,
        roster: [0, 1],
      },
      {
        from: 0,
        text: "All clear from procurement side. Renewal is good to go.",
        daysAgo: 4,
      },
    ],
  },
  // 5) Outage post-mortem follow-up
  {
    inbox: "support@example.com",
    externals: [
      { email: "alec.briggs@northwind.co", name: "Alec Briggs" },
      { email: "irina.popov@northwind.co", name: "Irina Popov" },
      { email: "mateo.santos@northwind.co", name: "Mateo Santos" },
    ],
    internalCcs: ["sam@example.com"],
    subject: "Follow-up on Tuesday's outage — RCA needed",
    messages: [
      {
        from: 0,
        text: "We got hit by Tuesday's 23-minute outage and lost about 4,000 inbound messages from a partner integration. Need a full RCA and a plan to prevent recurrence before our next exec review.",
        daysAgo: 5,
      },
      {
        from: "us",
        text: "Understood — sorry for the impact. RCA is being drafted now; expect it by Friday. Re: the lost messages: those should be in our retry queue, will confirm and replay them today.",
        daysAgo: 5,
      },
      {
        from: 1,
        text: "Thanks. Adding Mateo from our partner engineering team — he'll be the technical contact for the replay.",
        daysAgo: 5,
        roster: [0, 1, 2],
      },
      {
        from: "us",
        text: "Replay completed at 14:32 UTC. 3,841 messages restored, 159 were over the 7-day retry window and we're investigating those manually.",
        daysAgo: 4,
        roster: [0, 1, 2],
      },
      {
        from: 2,
        text: "Confirmed receipt of the 3,841. For the 159 — can you share which sender domains they came from? We can cross-reference against our partner logs.",
        daysAgo: 4,
        roster: [0, 1, 2],
      },
      {
        from: "us",
        text: "Sent the breakdown via secure share. Most are from two partners; one partner's retry config was overly aggressive and exhausted before our backend recovered.",
        daysAgo: 3,
        roster: [0, 1, 2],
      },
      {
        from: 0,
        text: "RCA looks thorough. Approving the incident as resolved on our side. Will share the summary with our exec team.",
        daysAgo: 2,
      },
    ],
  },
  // 6) Onboarding kick-off (3 externals + 1 internal)
  {
    inbox: "hello@example.com",
    externals: [
      { email: "jana.kowalski@stark.industries", name: "Jana Kowalski" },
      { email: "ravi.menon@stark.industries", name: "Ravi Menon" },
      { email: "lucia.fernandez@stark.industries", name: "Lucia Fernandez" },
    ],
    internalCcs: ["maya@example.com"],
    subject: "Stark onboarding — kickoff next steps",
    messages: [
      {
        from: 0,
        text: "Excited to get started. Looping in Ravi (engineering lead) and Lucia (ops). Can we schedule a kickoff next week and get the migration runbook?",
        daysAgo: 11,
      },
      {
        from: "us",
        text: "Welcome! Sent a calendar hold for Tuesday 10am PT. Runbook attached — it covers the three migration phases and the rollback path.",
        daysAgo: 11,
      },
      {
        from: 1,
        text: "Quick technical question — does the runbook assume single-region or are you moving us to the multi-region setup from day one?",
        daysAgo: 10,
      },
      {
        from: "us",
        text: "Single-region for phase 1 (US-East), multi-region added in phase 3 once we've validated the inbound flow. Splitting that out keeps the rollback simple.",
        daysAgo: 10,
      },
      {
        from: 2,
        text: "From the ops side: who owns DNS during the cutover? We can either do it ourselves or hand off — depends on your usual process.",
        daysAgo: 9,
      },
      {
        from: "us",
        text: "Either works. If you keep DNS, we'll provide the records and timing; if you hand off, we manage it via a temporary delegation. Most enterprise customers prefer to keep it.",
        daysAgo: 9,
      },
      {
        from: 0,
        text: "Let's keep DNS on our side. See you Tuesday.",
        daysAgo: 8,
      },
    ],
  },
  // 7) Feature request triage — chat-mode rollout
  {
    inbox: "support@example.com",
    externals: [
      { email: "deepa.rao@umbrella.med", name: "Deepa Rao" },
      { email: "hugo.lefevre@umbrella.med", name: "Hugo Lefevre" },
      { email: "anika.osei@umbrella.med", name: "Anika Osei" },
      { email: "petr.zelinka@umbrella.med", name: "Petr Zelinka" },
    ],
    internalCcs: ["lin@example.com", "diego@example.com"],
    subject: "Chat-mode UI for support inboxes — feedback",
    messages: [
      {
        from: 0,
        text: "We've been on the chat-mode beta for a week and have collated feedback from our 14-person support team. Top three asks: keyboard-only navigation, per-conversation sound toggles, and a way to surface roster changes more clearly.",
        daysAgo: 16,
      },
      {
        from: 1,
        text: "Adding to that — the avatar overlap at 5+ participants gets visually noisy. We'd love an option to collapse to 'X others' after the first three.",
        daysAgo: 16,
      },
      {
        from: "us",
        text: "Great feedback — keyboard nav is on the roadmap for next sprint, sound toggles we can ship behind a flag this week, and roster-change UI is shipping today actually (RosterDiffNotice component, will appear inline).",
        daysAgo: 15,
      },
      {
        from: 2,
        text: "Anika here, design lead. Curious what the roster-change UI looks like — is it a banner, a chip, or inline text? Happy to share our redlines if you want a second opinion.",
        daysAgo: 15,
      },
      {
        from: "us",
        text: "Inline pill above the message that triggered the change ('Joined: X. Left: Y'). Sending you a Loom of it now.",
        daysAgo: 14,
      },
      {
        from: 3,
        text: "Petr from engineering — when keyboard nav ships, can we get the keymap configurable? Half my team is on Vim bindings, half on default.",
        daysAgo: 13,
        roster: [0, 1, 2, 3],
      },
      {
        from: "us",
        text: "Configurable keymap is a yes — we'll ship default + Vim out of the box, with a JSON override for power users.",
        daysAgo: 13,
        roster: [0, 1, 2, 3],
      },
      {
        from: 2,
        text: "Saw the Loom. The pill placement is great. One nit: the icon for 'left' reads a little aggressive — we'd suggest a softer chevron-out instead of an X.",
        daysAgo: 12,
        roster: [0, 1, 2, 3],
      },
      {
        from: "us",
        text: "Good call, swapping the icon. Should be live in tomorrow's deploy.",
        daysAgo: 11,
        roster: [0, 1, 2, 3],
      },
      {
        from: 0,
        text: "Thanks all. We'll keep funneling feedback as we expand the rollout to more reps.",
        daysAgo: 9,
      },
    ],
  },
  // 8) Procurement / RFP — multi-vendor evaluation
  {
    inbox: "sales@example.com",
    externals: [
      { email: "priya.singh@procurement.globex.io", name: "Priya Singh" },
      { email: "olu.adebayo@globex.io", name: "Olu Adebayo" },
      { email: "tariq.khan@legal.acme.co", name: "Tariq Khan" },
    ],
    internalCcs: ["pavel@example.com"],
    subject: "RFP response — Globex / Acme joint deployment",
    messages: [
      {
        from: 0,
        text: "Joint RFP for the Globex/Acme deployment. We're evaluating three vendors. Tariq from Acme legal is leading the contract review side; Olu is the technical evaluator on Globex's end.",
        daysAgo: 21,
      },
      {
        from: "us",
        text: "Thanks for including us. Will send our full RFP response by next Friday — let me know if there are any sections you'd like us to prioritize.",
        daysAgo: 21,
      },
      {
        from: 1,
        text: "Section 4 (architecture) and section 6 (data residency) are the deciding factors for us. Everything else we can read async.",
        daysAgo: 20,
      },
      {
        from: "us",
        text: "Noted — we'll lead with those two. Quick question for residency: do you have a hard requirement for EU-only or is EU-primary with US-failover acceptable?",
        daysAgo: 20,
      },
      {
        from: 2,
        text: "From legal: EU-primary with US-failover is acceptable as long as the failover is documented and triggers an in-region notification. GDPR Art. 28(3) compliance is the bar.",
        daysAgo: 19,
      },
      {
        from: "us",
        text: "All set on Art. 28(3). RFP response delivered today. Sections 4 and 6 are the first 18 pages.",
        daysAgo: 14,
      },
      {
        from: 1,
        text: "Reviewed section 4. The architecture diagram on page 11 has a discrepancy with the description on page 9 — can you clarify whether ingress is single or multi-tenant on the inbound side?",
        daysAgo: 13,
      },
      {
        from: "us",
        text: "Multi-tenant ingress with per-tenant routing — page 9 description is correct, the diagram label was stale. Updated diagram attached.",
        daysAgo: 12,
      },
      {
        from: 0,
        text: "We've narrowed it to two finalists; you're one of them. Final pitch slot is next week, Tuesday or Thursday.",
        daysAgo: 7,
      },
      {
        from: "us",
        text: "Tuesday works. We'll bring our solutions architect and have a live demo of the multi-region setup.",
        daysAgo: 7,
      },
    ],
  },
  // 9) Partnership / co-marketing
  {
    inbox: "hello@example.com",
    externals: [
      { email: "wren.callahan@piedpiper.ai", name: "Wren Callahan" },
      { email: "soren.bakke@hooli.com", name: "Soren Bakke" },
    ],
    internalCcs: ["maya@example.com", "ren@example.com"],
    subject: "Co-marketing webinar — joint Q&A format",
    messages: [
      {
        from: 0,
        text: "Wanted to float a co-marketing idea: a joint webinar between us, Hooli, and you on the topic of 'modern email infrastructure for AI-native teams.' Soren from Hooli is interested and CC'd.",
        daysAgo: 19,
      },
      {
        from: 1,
        text: "Hooli's in if the format is panel + audience Q&A rather than alternating slides. Speakers are easier to recruit for that.",
        daysAgo: 18,
      },
      {
        from: "us",
        text: "Love the panel format. Proposing 4 panelists (one per company plus a moderator), 30 minutes panel, 20 minutes Q&A, 10 minutes wrap. Mid-November target?",
        daysAgo: 18,
      },
      {
        from: 0,
        text: "Mid-November works. Wren can moderate if that's helpful — I've MC'd two of these for AI conferences and it usually frees the company panelists to be more candid.",
        daysAgo: 17,
      },
      {
        from: "us",
        text: "Sold. Drafting the run-of-show this week and will share for review. We'll also handle the registration page.",
        daysAgo: 16,
      },
      {
        from: 1,
        text: "Hooli will cover paid promotion in our newsletter (~80k subscribers). Can we get a co-branded landing page or are we sending traffic to a unified one?",
        daysAgo: 15,
      },
      {
        from: "us",
        text: "Unified landing with all three logos and per-company UTM tags so we can each track signups. Fair?",
        daysAgo: 15,
      },
      {
        from: 0,
        text: "Fair. Looking forward to it.",
        daysAgo: 14,
      },
    ],
  },
  // 10) Migration / vendor consolidation
  {
    inbox: "sales@example.com",
    externals: [
      { email: "elena.varga@acme.co", name: "Elena Varga" },
      { email: "yuki.sato@orbis.health", name: "Yuki Sato" },
      { email: "bo.westwood@vandelay.imp", name: "Bo Westwood" },
    ],
    internalCcs: ["sam@example.com"],
    subject: "Consolidating three Acme business units onto one tenant",
    messages: [
      {
        from: 0,
        text: "We're consolidating Acme, Orbis, and Vandelay (recent acquisitions) onto a single tenant. Each has its own existing email setup — what does a phased migration look like?",
        daysAgo: 24,
      },
      {
        from: "us",
        text: "Three options: (1) lift-and-shift each in turn, (2) parallel-run with gradual cutover, (3) net-new tenant with read-only archives. Most customers in your shape pick (2).",
        daysAgo: 24,
      },
      {
        from: 1,
        text: "Yuki here from Orbis. Our compliance team needs the read-only archive to be HIPAA-eligible. Does option 2 preserve that?",
        daysAgo: 23,
      },
      {
        from: "us",
        text: "Yes — the archive lives on the same HIPAA-eligible tier as production. We sign a BAA covering both.",
        daysAgo: 22,
      },
      {
        from: 2,
        text: "Bo from Vandelay. Our setup is small (12 users) so I assume we go last? Our domain is also currently MX'd to a different provider — not sure how that affects sequencing.",
        daysAgo: 21,
      },
      {
        from: "us",
        text: "Vandelay last makes sense. The MX swap is independent of consolidation — we'll script the cutover so it's ~2 minutes of TTL-bounded propagation.",
        daysAgo: 20,
      },
      {
        from: 0,
        text: "Phasing approved internally. Acme first (60 users) starting next month, Orbis 4 weeks later, Vandelay 4 weeks after that.",
        daysAgo: 16,
      },
      {
        from: "us",
        text: "Locked in. Sending project plan + per-phase runbook. Kickoff call for Acme phase next Wednesday.",
        daysAgo: 15,
      },
      {
        from: 1,
        text: "Confirmed for the Orbis phase. Will pre-stage our HIPAA addendum so it's signed before our cutover.",
        daysAgo: 12,
      },
      {
        from: 2,
        text: "Vandelay confirmed for the final phase. I'll loop in our IT once we get within a month of cutover.",
        daysAgo: 10,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// conversation_id — same algorithm as worker/src/lib/conversation-id.ts.
// Computed for the seed because we can't await crypto.subtle here in a
// synchronous code path; node:crypto's createHash is the equivalent.
// ---------------------------------------------------------------------------
const INTERNAL_DOMAIN = "example.com";

function computeConversationIdSync(
  inbox: string,
  externals: string[],
): string | null {
  const norm = Array.from(
    new Set(externals.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ).sort();
  if (norm.length < 2) return null;
  const key = `${inbox.trim().toLowerCase()}::${norm.join("|")}`;
  const hex = createHash("sha256").update(key).digest("hex");
  return `c_${hex.slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Email content libraries — keyed by inbox so subjects/bodies match the
// channel's character.
// ---------------------------------------------------------------------------
type Snippet = { subject: string; body: string };

const SUPPORT_SNIPPETS: Snippet[] = [
  {
    subject: "Trouble logging in on mobile",
    body: "I can't log into the iOS app after the latest update — it just hangs on the spinner. Desktop works fine. Tried reinstalling, no change.",
  },
  {
    subject: "Webhook deliveries failing intermittently",
    body: "We're seeing 504s on about 3% of webhook deliveries to our /events endpoint. It's been happening for the past 48 hours. Sample request IDs attached.",
  },
  {
    subject: "API rate limits unclear",
    body: "What's the per-minute rate limit for the /messages endpoint on the Pro plan? The docs mention 60/s but our 429s suggest something lower.",
  },
  {
    subject: "How do I rotate an API key without downtime?",
    body: "Looking for the recommended way to rotate keys in production. Is there a grace-period overlap, or do I need to coordinate the swap myself?",
  },
  {
    subject: "Re: Trouble logging in on mobile",
    body: "That worked — thank you! Force-quitting and reinstalling fixed it.",
  },
  {
    subject: "Re: Webhook deliveries failing intermittently",
    body: "Tried the retry flag — still seeing failures on the same three endpoints. Latest IDs in the next message.",
  },
  {
    subject: "Bug: timestamps off by one hour after DST",
    body: "Since Sunday all our scheduled sends are firing an hour late. Looks like a TZ issue on your side. Account ID acme-7821.",
  },
  {
    subject: "Export taking 30+ minutes",
    body: "The CSV export for our last 90 days is timing out. Anything we can do about this? It used to take ~3 minutes.",
  },
  {
    subject: "Two-factor backup codes not working",
    body: "I lost my phone and the backup codes I saved aren't being accepted. What's the recovery path?",
  },
  {
    subject: "Outbound mail going to spam in Gmail",
    body: "We set up DKIM and SPF as the docs suggested but our sends still land in spam at most Gmail addresses. DMARC is also passing.",
  },
  {
    subject: "Edge case in the threading logic",
    body: "Replies from the same person to different inboxes are getting threaded together. Our customers think we're cross-routing emails internally.",
  },
  {
    subject: "Quick question on retention",
    body: "How long are messages retained on the Free plan? Want to make sure we don't lose anything before upgrading.",
  },
];

const SALES_SNIPPETS: Snippet[] = [
  {
    subject: "Enterprise pricing question",
    body: "We're evaluating a few tools for our team of 50. Could you share enterprise pricing and whether SSO + audit logs are included?",
  },
  {
    subject: "Demo request — multi-region rollout",
    body: "Could we get a 30-min walkthrough? We're rolling out to teams in the EU and US and need to understand data residency options.",
  },
  {
    subject: "RFP for procurement",
    body: "Attached is our RFP. Looking for responses by end of month. Happy to clarify any sections — let me know.",
  },
  {
    subject: "Quote follow-up",
    body: "Thanks for the quote last week. I shared it internally; we have a few clarifying questions on the implementation timeline.",
  },
  {
    subject: "Annual contract — need invoice in EUR",
    body: "We're ready to sign on an annual plan but our finance team needs the invoice in EUR rather than USD. Is that supported?",
  },
  {
    subject: "Considering a switch from Front",
    body: "Hey — we're looking at moving off Front for our support team. Curious how migration goes; we have ~18 months of history.",
  },
  {
    subject: "Discount for nonprofits?",
    body: "We're a registered 501(c)(3). Is there any nonprofit discount available?",
  },
  {
    subject: "How does seat counting work for shared inboxes?",
    body: "If five reps share a support@ inbox, do we pay for one seat or five? The pricing page wasn't clear.",
  },
  {
    subject: "Need a longer trial",
    body: "The default 14-day trial is too short for our procurement cycle. Could we get an extension to 45 days?",
  },
];

const BILLING_SNIPPETS: Snippet[] = [
  {
    subject: "Invoice for September seems wrong",
    body: "Our September invoice is $200 over the usual amount. Can you look into the line items?",
  },
  {
    subject: "Switching from monthly to annual",
    body: "Want to move our subscription to annual billing. Will the prorated credit just roll forward?",
  },
  {
    subject: "Update payment method",
    body: "Old card expired and the auto-update didn't kick in. New card is in the portal — please re-run the failed charge when convenient.",
  },
  {
    subject: "VAT number for invoice",
    body: "Could you add our VAT number (DE123456789) to upcoming invoices? Our finance team can't process them without it.",
  },
  {
    subject: "Refund request",
    body: "We accidentally subscribed twice last month. Could one of the charges be refunded?",
  },
  {
    subject: "Receipts for 2025 tax filing",
    body: "Need bulk-download of all our receipts from 2025 for tax filing. Is that exposed in the dashboard or do I have to email each time?",
  },
];

const HELLO_SNIPPETS: Snippet[] = [
  {
    subject: "Quick intro",
    body: "Hi! Just signed up — wanted to introduce ourselves. We're building a tools-for-creators app and are exploring email infrastructure.",
  },
  {
    subject: "Partnership idea",
    body: "We run a developer newsletter (~12k subs) and think there's a partnership opportunity. Open to chatting?",
  },
  {
    subject: "Loving the product so far",
    body: "Just wanted to say — the new threading view is a huge improvement. Saved us probably 40 minutes a day already.",
  },
  {
    subject: "Feature request: keyboard shortcut for archive",
    body: "Would love a keyboard shortcut to archive a thread. Right now I have to click the menu every time.",
  },
  {
    subject: "Feedback after first week",
    body: "We've been using it for a week. Two things slowing us down: the search is fuzzy in unhelpful ways, and there's no way to bulk-mark as read.",
  },
];

const NEWSLETTER_SNIPPETS: Snippet[] = [
  {
    subject: "Weekly digest",
    body: "Top three threads this week: Carla's webhook saga (resolved), Bob's enterprise quote (in progress), Alice's mobile bug (closed).",
  },
  {
    subject: "Product update — chat mode",
    body: "We're rolling out chat-style rendering for support inboxes. If you want it on by default, ping us.",
  },
  {
    subject: "Office hours Friday",
    body: "Holding open office hours this Friday at 11am PT. Come ask anything — we'll be in the Slack #saasmail channel.",
  },
  {
    subject: "Outage post-mortem",
    body: "Yesterday's 23-minute outage was caused by a bad config push. Post-mortem here. Sorry for the trouble.",
  },
];

const NOTIFICATIONS_SNIPPETS: Snippet[] = [
  {
    subject: "[CI] Build failed on main",
    body: "Build #4521 failed: \"Cannot find module '@/lib/foo'\". Triggered by commit 8a3f2b9.",
  },
  {
    subject: "Domain verification successful",
    body: "Your domain mail.acme.co is now verified. SPF, DKIM, and DMARC checks all passing.",
  },
  {
    subject: "Daily summary — 14 unread",
    body: "You have 14 unread messages across 4 inboxes. Oldest is 2 days old.",
  },
  {
    subject: "Webhook delivery quota at 80%",
    body: "You've used 80% of your monthly webhook quota. Upgrade or wait until the cycle resets on the 1st.",
  },
  {
    subject: "Login from new device",
    body: "A new sign-in was detected from Chrome on macOS, San Francisco. If this wasn't you, rotate your password.",
  },
  {
    subject: "Password expires in 7 days",
    body: "Your account password is set to expire on Nov 12. Update it from settings to avoid being locked out.",
  },
];

const INBOX_SNIPPETS: Record<string, Snippet[]> = {
  "support@example.com": SUPPORT_SNIPPETS,
  "sales@example.com": SALES_SNIPPETS,
  "billing@example.com": BILLING_SNIPPETS,
  "hello@example.com": HELLO_SNIPPETS,
  "newsletter@example.com": NEWSLETTER_SNIPPETS,
  "notifications@example.com": NOTIFICATIONS_SNIPPETS,
};

// Padding text used to inflate "long" emails so we have a real range
// of message lengths in the dataset (short / medium / long mix).
const FILLER_LINES = [
  "For context: we kicked off this initiative back in Q2 and have been iterating since.",
  "Happy to jump on a call if it's easier than going back and forth in email.",
  "I've also CC'd our team lead in case anyone else needs to weigh in.",
  "Below is a more detailed breakdown of what we tried and the order we tried it in.",
  "We can be flexible on timing — let us know what works on your end.",
  "Just so you have the full picture, here's how this fits into our broader rollout plan.",
  "I attached the relevant logs / screenshots / configs — let me know if you can't open them.",
  "We're not blocked yet but it's becoming a recurring distraction during planning.",
  "If it helps narrow things down, we can repro it deterministically on a fresh account too.",
  "Open to suggestions on how to approach this differently if our framing is off.",
];

function inflateBody(body: string, targetWords: number): string {
  const lines = [body];
  while (lines.join(" ").split(/\s+/).length < targetWords) {
    lines.push(pick(FILLER_LINES));
  }
  return lines.join("\n\n");
}

function bodyHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${sqlEscape(p)}</p>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Build people
// ---------------------------------------------------------------------------
interface Person {
  id: string;
  email: string;
  name: string;
  inboxes: string[]; // recipients they email
  createdOffsetDays: number;
}

function buildPeople(count: number): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  let i = 0;
  while (out.length < count) {
    const fn = pick(FIRST_NAMES);
    const ln = pick(LAST_NAMES);
    const dom = pick(DOMAINS);
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i % 5 === 0 ? "" : ""}@${dom}`;
    if (seen.has(email)) {
      i++;
      continue;
    }
    seen.add(email);
    const inboxCount = chance(0.5) ? 1 : chance(0.6) ? 2 : chance(0.7) ? 3 : 4;
    const inboxes = pickN(INBOXES, inboxCount).map((i) => i.email);
    out.push({
      id: `p_${out.length.toString().padStart(3, "0")}`,
      email,
      name: `${fn} ${ln}`,
      inboxes,
      createdOffsetDays: randInt(1, 60),
    });
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build emails per person, per inbox
// ---------------------------------------------------------------------------
interface Email {
  id: string;
  personId: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isRead: 0 | 1;
  receivedOffsetSec: number;
  cc?: CcEntry[];
  conversationId?: string | null;
}

interface SentReply {
  id: string;
  personId: string;
  fromAddress: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo: string | null;
  sentOffsetSec: number;
  cc?: CcEntry[];
  conversationId?: string | null;
}

// ---------------------------------------------------------------------------
// CC roster helpers
// ---------------------------------------------------------------------------
function pickCcRoster(): CcEntry[] {
  // Choose 1-3 CCs. Most common: mix of one internal + one or two external.
  // Sometimes all-external or all-internal.
  const flavorRoll = rand();
  const total = randInt(1, 3);
  if (flavorRoll < 0.6) {
    // Mix: 1 internal + (total-1) external (with at least 1 external).
    const internalCount = Math.max(1, Math.min(1, total - 1));
    const externalCount = total - internalCount;
    return [
      ...pickN(INTERNAL_TEAM, internalCount),
      ...pickN(EXTERNAL_COLLABORATORS, externalCount),
    ];
  } else if (flavorRoll < 0.85) {
    // All external.
    return pickN(EXTERNAL_COLLABORATORS, total);
  } else {
    // All internal.
    return pickN(INTERNAL_TEAM, Math.min(total, INTERNAL_TEAM.length));
  }
}

function ccToJson(cc: CcEntry[]): string {
  // Build JSON, then encode for SQL: single quotes inside JSON values
  // (e.g. "Lin O'Brien") need to become '' in the SQL string literal.
  const json = JSON.stringify(
    cc.map((c) => ({ email: c.email, name: c.name ?? null })),
  );
  return `'${sqlEscape(json)}'`;
}

// ---------------------------------------------------------------------------
// Attachments — small fake fixture files we ship in seeds/attachments/ and
// upload to R2 via seeds/upload-attachments.sh.
// ---------------------------------------------------------------------------
interface AttachmentFixture {
  filename: string;
  contentType: string;
}

const ATTACHMENT_FIXTURES: AttachmentFixture[] = [
  { filename: "invoice.pdf", contentType: "application/pdf" },
  { filename: "screenshot.png", contentType: "image/png" },
  { filename: "Q3-budget.csv", contentType: "text/csv" },
  { filename: "meeting-notes.txt", contentType: "text/plain" },
  {
    filename: "roadmap.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  { filename: "logs.txt", contentType: "text/plain" },
];

interface Attachment {
  id: string;
  emailId: string;
  filename: string;
  contentType: string;
  size: number;
  r2Key: string;
}

function fixtureSize(filename: string): number {
  // Resolve relative to this file regardless of cwd.
  const dir = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
  return statSync(join(dir, "attachments", filename)).size;
}

function buildEmails(people: Person[]): {
  emails: Email[];
  sent: SentReply[];
  attachments: Attachment[];
  rosterChangePeopleIds: string[];
} {
  const emails: Email[] = [];
  const sent: SentReply[] = [];
  const attachments: Attachment[] = [];
  let eId = 0;
  let sId = 0;
  let aId = 0;

  // Pre-compute the 5 roster-change demo people: the FIRST 5 people whose
  // total inbound count would be >= 3. We don't know inbound counts yet
  // because they're determined inside this function, so we do a dry pass
  // using the same RNG-free heuristic: a person is eligible if they have
  // any inbox where the thread length >= 3. To keep this deterministic
  // without disturbing the main RNG sequence we instead pick people whose
  // inbox roster makes 3+ inbound likely (sum of inbox count >= 1 plus
  // we'll re-check after generation). Simpler approach: do generation
  // first, then assign roster changes to the first 5 eligible people in a
  // post-pass that overwrites cc on their longest thread (so the rest of
  // the RNG stream is preserved).

  // Track threads as we generate, so the roster-change post-pass can find
  // the longest thread per person without rescanning emails twice.
  // threadIndex: personId -> inbox -> [emailId, emailId, ...]
  const threads: Map<string, Map<string, string[]>> = new Map();

  for (const p of people) {
    for (const inbox of p.inboxes) {
      // Heavy-tailed thread length: most are 1-3, some 4-8, a few 9-15.
      const r = rand();
      const threadLen =
        r < 0.55 ? randInt(1, 3) : r < 0.9 ? randInt(4, 8) : randInt(9, 15);
      const snippets = INBOX_SNIPPETS[inbox] ?? HELLO_SNIPPETS;
      // Pick a base subject; replies reuse "Re: <subject>".
      const base = pick(snippets);
      const isAutomated =
        inbox === "newsletter@example.com" ||
        inbox === "notifications@example.com";
      const threadIds: string[] = [];

      for (let i = 0; i < threadLen; i++) {
        // Spread emails across the time the person has existed (max 60 days back).
        const maxOffsetDays = p.createdOffsetDays;
        const offsetDays =
          (maxOffsetDays * (threadLen - i)) / threadLen + rand() * 0.5;
        const offsetSec = Math.floor(offsetDays * 86400) + randInt(0, 86399);

        const isFirst = i === 0;
        const subject = isFirst ? base.subject : `Re: ${base.subject}`;
        // Body: pull a different snippet for follow-ups; vary length.
        const snippet = isFirst ? base : pick(snippets);
        // Length distribution: 30% short, 50% med, 20% long. Skew automated short.
        const lengthRoll = rand();
        const targetWords = isAutomated
          ? randInt(15, 40)
          : lengthRoll < 0.3
            ? randInt(20, 45)
            : lengthRoll < 0.8
              ? randInt(60, 140)
              : randInt(180, 320);
        const text = inflateBody(snippet.body, targetWords);

        // Read state: very recent emails skew unread.
        const isRecent = offsetDays < 3;
        const isRead: 0 | 1 = isRecent
          ? chance(0.5)
            ? 0
            : 1
          : chance(0.85)
            ? 1
            : 0;

        // ~20% chance this email has CCs (skip automated newsletter/
        // notifications inboxes — those are blast lists, not conversations).
        const cc = !isAutomated && chance(0.2) ? pickCcRoster() : undefined;

        const emailId = `e_${eId.toString().padStart(4, "0")}`;
        emails.push({
          id: emailId,
          personId: p.id,
          recipient: inbox,
          subject,
          bodyHtml: bodyHtml(text),
          bodyText: text,
          isRead,
          receivedOffsetSec: offsetSec,
          cc,
        });
        threadIds.push(emailId);
        eId++;

        // ~15% chance of 1-2 attachments on inbound emails (skip automated).
        if (!isAutomated && chance(0.15)) {
          const attachCount = chance(0.7) ? 1 : 2;
          const fixtures = pickN(ATTACHMENT_FIXTURES, attachCount);
          for (const fix of fixtures) {
            const attId = `a_${aId.toString().padStart(4, "0")}`;
            attachments.push({
              id: attId,
              emailId,
              filename: fix.filename,
              contentType: fix.contentType,
              size: fixtureSize(fix.filename),
              r2Key: `attachments/${emailId}/${attId}/${fix.filename}`,
            });
            aId++;
          }
        }
      }

      if (!threads.has(p.id)) threads.set(p.id, new Map());
      threads.get(p.id)!.set(inbox, threadIds);

      // Sometimes seed a reply from us back to them (~30% of threads).
      if (!isAutomated && chance(0.3)) {
        const replyOffsetSec = randInt(1800, 86400 * 2);
        const lastEmail = emails[emails.length - 1];
        const replyText = inflateBody(
          "Thanks for reaching out — I've looped in the right person on our side. Will follow up shortly with a more concrete answer.",
          randInt(30, 80),
        );
        // Sent replies also get CCs ~20% of the time.
        const sentCc = chance(0.2) ? pickCcRoster() : undefined;
        sent.push({
          id: `s_${sId.toString().padStart(4, "0")}`,
          personId: p.id,
          fromAddress: inbox,
          to: p.email,
          subject: `Re: ${base.subject}`,
          bodyHtml: bodyHtml(replyText),
          bodyText: replyText,
          inReplyTo: lastEmail.id,
          sentOffsetSec: Math.max(
            lastEmail.receivedOffsetSec - replyOffsetSec,
            60,
          ),
          cc: sentCc,
        });
        sId++;
      }
    }
  }

  // ---- Roster-change demo --------------------------------------------------
  // Pick first 5 people in id order whose total inbound count >= 3, then
  // overwrite cc on a single thread per person (the longest one with len >= 3)
  // to demonstrate add/drop roster changes between consecutive messages.
  const inboundCounts = new Map<string, number>();
  for (const e of emails) {
    inboundCounts.set(e.personId, (inboundCounts.get(e.personId) ?? 0) + 1);
  }
  const rosterChangePeopleIds: string[] = [];
  for (const p of people) {
    if (rosterChangePeopleIds.length >= 5) break;
    if ((inboundCounts.get(p.id) ?? 0) < 3) continue;
    const inboxThreads = threads.get(p.id);
    if (!inboxThreads) continue;
    // Find the longest thread for this person with len >= 3.
    let bestInbox: string | null = null;
    let bestLen = 0;
    for (const [inbox, ids] of inboxThreads) {
      if (ids.length >= 3 && ids.length > bestLen) {
        bestInbox = inbox;
        bestLen = ids.length;
      }
    }
    if (!bestInbox) continue;
    const ids = inboxThreads.get(bestInbox)!;
    // Build a small roster change pattern: external1 alone, then add
    // internal1, then drop internal1 (back to external1), and so on.
    const ext1 = EXTERNAL_COLLABORATORS[0];
    const ext2 = EXTERNAL_COLLABORATORS[1];
    const int1 = INTERNAL_TEAM[0];
    const int2 = INTERNAL_TEAM[1];
    const rosters: CcEntry[][] = [
      [ext1],
      [ext1, int1],
      [ext1],
      [ext1, ext2, int1],
      [ext1, ext2, int1, int2],
      [ext1, ext2, int2],
      [ext2, int2],
      [int2],
    ];
    for (let i = 0; i < ids.length; i++) {
      const target = emails.find((e) => e.id === ids[i]);
      if (!target) continue;
      target.cc = rosters[i % rosters.length];
    }
    rosterChangePeopleIds.push(p.id);
  }

  return { emails, sent, attachments, rosterChangePeopleIds };
}

// ---------------------------------------------------------------------------
// Build group threads — produces extra people, emails, and sent replies
// that share a conversation_id per thread. IDs are namespaced so they
// don't collide with the main 1-on-1 generator.
// ---------------------------------------------------------------------------
interface GroupBuildResult {
  groupPeople: Person[];
  groupEmails: Email[];
  groupSent: SentReply[];
  threadConversationIds: string[];
  groupMessageCounts: number[];
}

function buildGroupThreads(
  startEmailIdx: number,
  startSentIdx: number,
): GroupBuildResult {
  const groupPeople: Person[] = [];
  const groupEmails: Email[] = [];
  const groupSent: SentReply[] = [];
  const threadConversationIds: string[] = [];
  const groupMessageCounts: number[] = [];

  // Allocate one Person per unique external email across all GROUP_THREADS,
  // numbered p_g00, p_g01, ... in the order they're first encountered.
  const personByEmail = new Map<string, Person>();
  let pgIdx = 0;
  for (const t of GROUP_THREADS) {
    for (const ext of t.externals) {
      const key = ext.email.toLowerCase();
      if (personByEmail.has(key)) continue;
      const id = `p_g${pgIdx.toString().padStart(2, "0")}`;
      pgIdx++;
      const person: Person = {
        id,
        email: ext.email,
        name: ext.name,
        inboxes: [t.inbox],
        createdOffsetDays: 30,
      };
      personByEmail.set(key, person);
      groupPeople.push(person);
    }
  }

  let eId = startEmailIdx;
  let sId = startSentIdx;

  for (const t of GROUP_THREADS) {
    const externalEmails = t.externals.map((e) => e.email);
    const conversationId = computeConversationIdSync(t.inbox, externalEmails);
    if (!conversationId) {
      throw new Error(
        `GROUP_THREAD with inbox=${t.inbox} produced null conversation_id (need >= 2 externals)`,
      );
    }
    threadConversationIds.push(conversationId);
    groupMessageCounts.push(t.messages.length);

    // Track the most-recent external sender for outbound `to` selection.
    let lastExternalIdx = 0;

    for (let mi = 0; mi < t.messages.length; mi++) {
      const m = t.messages[mi];

      // Determine the roster (external indexes) for this message: defaults to
      // "all externals other than the sender (if external)".
      const allExtIdx = t.externals.map((_, idx) => idx);
      let messageExtRoster: number[];
      if (m.roster) {
        messageExtRoster = m.roster;
      } else if (m.from === "us") {
        messageExtRoster = allExtIdx;
      } else {
        messageExtRoster = allExtIdx.filter((idx) => idx !== m.from);
      }

      // Internal CCs roster: same on every message (no per-message override).
      const internalRoster = t.internalCcs;

      // Build cc entries — exclude the sender and exclude the outbound `to`
      // recipient (computed below for outbound).
      const buildCc = (excludeEmails: Set<string>): CcEntry[] => {
        const cc: CcEntry[] = [];
        for (const idx of messageExtRoster) {
          const ext = t.externals[idx];
          if (excludeEmails.has(ext.email.toLowerCase())) continue;
          cc.push({ email: ext.email, name: ext.name });
        }
        for (const intEmail of internalRoster) {
          if (excludeEmails.has(intEmail.toLowerCase())) continue;
          const intMember = INTERNAL_TEAM.find((i) => i.email === intEmail);
          cc.push({
            email: intEmail,
            name: intMember?.name ?? null,
          });
        }
        return cc;
      };

      // Time spread — same as 1-on-1 path: derive offset from daysAgo with
      // a small reproducible jitter from `rand`.
      const offsetSec = Math.floor(m.daysAgo * 86400) + randInt(0, 86399);

      // sqlEscape happens at render time everywhere else, so keep the raw
      // subject here and let the chunked-INSERT loop escape it.
      const rawSubject = mi === 0 ? t.subject : `Re: ${t.subject}`;

      if (m.from === "us") {
        // Outbound. `to` = most-recent external sender's email; cc = all
        // others (other externals + internalCcs).
        const toExt = t.externals[lastExternalIdx];
        const cc = buildCc(new Set([toExt.email.toLowerCase()]));
        const text = m.text;
        groupSent.push({
          id: `s_${sId.toString().padStart(4, "0")}`,
          personId: personByEmail.get(toExt.email.toLowerCase())!.id,
          fromAddress: t.inbox,
          to: toExt.email,
          subject: rawSubject,
          bodyHtml: bodyHtml(text),
          bodyText: text,
          inReplyTo: null,
          sentOffsetSec: offsetSec,
          cc: cc.length > 0 ? cc : undefined,
          conversationId,
        });
        sId++;
      } else {
        // Inbound. sender = externals[m.from], recipient = inbox, cc = all
        // other externals on roster + internal ccs.
        const sender = t.externals[m.from];
        const senderPerson = personByEmail.get(sender.email.toLowerCase())!;
        lastExternalIdx = m.from;
        const cc = buildCc(
          new Set([sender.email.toLowerCase(), t.inbox.toLowerCase()]),
        );
        const isRecent = m.daysAgo < 3;
        const isRead: 0 | 1 = isRecent
          ? chance(0.5)
            ? 0
            : 1
          : chance(0.85)
            ? 1
            : 0;
        const text = m.text;
        groupEmails.push({
          id: `e_${eId.toString().padStart(4, "0")}`,
          personId: senderPerson.id,
          recipient: t.inbox,
          subject: rawSubject,
          bodyHtml: bodyHtml(text),
          bodyText: text,
          isRead,
          receivedOffsetSec: offsetSec,
          cc: cc.length > 0 ? cc : undefined,
          conversationId,
        });
        eId++;
      }
    }
  }

  return {
    groupPeople,
    groupEmails,
    groupSent,
    threadConversationIds,
    groupMessageCounts,
  };
}

// ---------------------------------------------------------------------------
// Render SQL
// ---------------------------------------------------------------------------
interface RenderResult {
  sql: string;
  attachments: Attachment[];
  rosterChangePeopleIds: string[];
  groupConversationIds: string[];
  groupMessageCounts: number[];
  groupPersonIds: string[];
  stats: {
    people: number;
    emails: number;
    sent: number;
    attachments: number;
    groupPeople: number;
    groupThreads: number;
    groupMessages: number;
  };
}

function renderSql(): RenderResult {
  const people = buildPeople(100);
  const { emails, sent, attachments, rosterChangePeopleIds } =
    buildEmails(people);

  // Append group threads after the 1-on-1 generation. Pass the next
  // available email/sent indexes so id namespaces stay disjoint.
  const startEmailIdx = emails.length;
  const startSentIdx = sent.length;
  const group = buildGroupThreads(startEmailIdx, startSentIdx);
  // Merge group rows into the main arrays so the chunked INSERTs cover them.
  const allPeople = [...people, ...group.groupPeople];
  for (const e of group.groupEmails) emails.push(e);
  for (const s of group.groupSent) sent.push(s);

  const lines: string[] = [];

  lines.push(
    "-- AUTO-GENERATED by seeds/generate-demo.ts. Do not edit by hand.",
  );
  lines.push("-- Run: yarn db:seed:dev (after re-running the generator).");
  lines.push(
    `-- Stats: ${allPeople.length} people, ${emails.length} emails, ${sent.length} sent replies, ${attachments.length} attachments.`,
  );
  lines.push(
    `-- Group threads: ${GROUP_THREADS.length} (${group.groupMessageCounts.join(" + ")} = ${group.groupEmails.length + group.groupSent.length} messages).`,
  );
  lines.push("");
  lines.push("DELETE FROM sequence_emails;");
  lines.push("DELETE FROM sequence_enrollments;");
  lines.push("DELETE FROM sequences;");
  lines.push("DELETE FROM api_keys;");
  lines.push("DELETE FROM email_templates;");
  lines.push("DELETE FROM invitations;");
  lines.push("DELETE FROM attachments;");
  lines.push("DELETE FROM sent_emails;");
  lines.push("DELETE FROM emails;");
  lines.push("DELETE FROM people;");
  lines.push("DELETE FROM inbox_permissions;");
  lines.push("DELETE FROM sender_identities;");
  lines.push("");

  // Inboxes
  lines.push(
    "INSERT OR REPLACE INTO sender_identities (email, display_name, created_at, updated_at) VALUES",
  );
  lines.push(
    INBOXES.map(
      (i) =>
        `  ('${i.email}', '${sqlEscape(i.display)}', CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER))`,
    ).join(",\n") + ";",
  );
  lines.push("");

  // People (1-on-1 generator + group-thread externals).
  lines.push(
    "INSERT OR REPLACE INTO people (id, email, name, last_email_at, unread_count, total_count, created_at, updated_at) VALUES",
  );
  lines.push(
    allPeople
      .map(
        (p) =>
          `  ('${p.id}', '${sqlEscape(p.email)}', '${sqlEscape(p.name)}', 0, 0, 0, (CAST(strftime('%s','now') AS INTEGER) - 86400 * ${p.createdOffsetDays}), CAST(strftime('%s','now') AS INTEGER))`,
      )
      .join(",\n") + ";",
  );
  lines.push("");

  // Emails — chunk inserts so we don't blow past SQLite's statement limit.
  const CHUNK = 50;
  for (let off = 0; off < emails.length; off += CHUNK) {
    const chunk = emails.slice(off, off + CHUNK);
    lines.push(
      "INSERT OR REPLACE INTO emails (id, person_id, recipient, subject, body_html, body_text, raw_headers, message_id, spf, dkim, dmarc, is_read, received_at, created_at, cc, conversation_id) VALUES",
    );
    lines.push(
      chunk
        .map(
          (e) =>
            `  ('${e.id}', '${e.personId}', '${e.recipient}', '${sqlEscape(e.subject)}', '${e.bodyHtml}', '${sqlEscape(e.bodyText)}', '{}', '<${e.id}@example.test>', 'pass', 'pass', 'pass', ${e.isRead}, (CAST(strftime('%s','now') AS INTEGER) - ${e.receivedOffsetSec}), (CAST(strftime('%s','now') AS INTEGER) - ${e.receivedOffsetSec}), ${e.cc ? ccToJson(e.cc) : "NULL"}, ${e.conversationId ? `'${e.conversationId}'` : "NULL"})`,
        )
        .join(",\n") + ";",
    );
    lines.push("");
  }

  // Sent replies
  if (sent.length > 0) {
    for (let off = 0; off < sent.length; off += CHUNK) {
      const chunk = sent.slice(off, off + CHUNK);
      lines.push(
        "INSERT OR REPLACE INTO sent_emails (id, person_id, to_address, from_address, subject, body_html, body_text, in_reply_to, status, sent_at, created_at, cc, conversation_id) VALUES",
      );
      lines.push(
        chunk
          .map(
            (s) =>
              `  ('${s.id}', '${s.personId}', '${sqlEscape(s.to)}', '${s.fromAddress}', '${sqlEscape(s.subject)}', '${s.bodyHtml}', '${sqlEscape(s.bodyText)}', ${s.inReplyTo ? `'${s.inReplyTo}'` : "NULL"}, 'sent', (CAST(strftime('%s','now') AS INTEGER) - ${s.sentOffsetSec}), (CAST(strftime('%s','now') AS INTEGER) - ${s.sentOffsetSec}), ${s.cc ? ccToJson(s.cc) : "NULL"}, ${s.conversationId ? `'${s.conversationId}'` : "NULL"})`,
          )
          .join(",\n") + ";",
      );
      lines.push("");
    }
  }

  // Attachments
  if (attachments.length > 0) {
    for (let off = 0; off < attachments.length; off += CHUNK) {
      const chunk = attachments.slice(off, off + CHUNK);
      lines.push(
        "INSERT OR REPLACE INTO attachments (id, email_id, filename, content_type, size, r2_key, content_id, created_at) VALUES",
      );
      lines.push(
        chunk
          .map(
            (a) =>
              `  ('${a.id}', '${a.emailId}', '${sqlEscape(a.filename)}', '${sqlEscape(a.contentType)}', ${a.size}, '${sqlEscape(a.r2Key)}', NULL, CAST(strftime('%s','now') AS INTEGER))`,
          )
          .join(",\n") + ";",
      );
      lines.push("");
    }
  }

  // Recompute aggregate columns on people from the emails we just inserted.
  lines.push("UPDATE people SET");
  lines.push(
    "  last_email_at = COALESCE((SELECT MAX(received_at) FROM emails WHERE person_id = people.id), last_email_at),",
  );
  lines.push(
    "  unread_count  = COALESCE((SELECT SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) FROM emails WHERE person_id = people.id), 0),",
  );
  lines.push(
    "  total_count   = COALESCE((SELECT COUNT(*) FROM emails WHERE person_id = people.id), 0);",
  );
  lines.push("");

  return {
    sql: lines.join("\n"),
    attachments,
    rosterChangePeopleIds,
    groupConversationIds: group.threadConversationIds,
    groupMessageCounts: group.groupMessageCounts,
    groupPersonIds: group.groupPeople.map((p) => p.id),
    stats: {
      people: allPeople.length,
      emails: emails.length,
      sent: sent.length,
      attachments: attachments.length,
      groupPeople: group.groupPeople.length,
      groupThreads: GROUP_THREADS.length,
      groupMessages: group.groupEmails.length + group.groupSent.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Render the upload script — a bash script that pushes every distinct
// (r2_key, filename) pair to the local R2 bucket bound in wrangler.jsonc.
// ---------------------------------------------------------------------------
function renderUploadScript(attachments: Attachment[]): string {
  const lines: string[] = [];
  lines.push("#!/usr/bin/env bash");
  lines.push("# AUTO-GENERATED by seeds/generate-demo.ts. Do not edit.");
  lines.push("# Uploads demo attachments to the local R2 bucket.");
  lines.push("set -e");
  lines.push("");
  lines.push("BUCKET=saasmail-attachments");
  lines.push('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"');
  lines.push("");
  // Dedupe by r2_key — same key shouldn't be uploaded twice. r2_keys are
  // already unique per (email, attachment) pair so this is just defensive.
  const seen = new Set<string>();
  for (const a of attachments) {
    if (seen.has(a.r2Key)) continue;
    seen.add(a.r2Key);
    // We're calling wrangler from the repo root, so file=seeds/attachments/...
    lines.push(
      `npx wrangler r2 object put "$BUCKET/${a.r2Key}" --file="$SCRIPT_DIR/attachments/${a.filename}" --local`,
    );
  }
  lines.push("");
  lines.push('echo "Uploaded ${#}: $(echo $0)"');
  lines.push("");
  return lines.join("\n");
}

const result = renderSql();
const dir = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const sqlTarget = join(dir, "demo.sql");
writeFileSync(sqlTarget, result.sql);
const uploadTarget = join(dir, "upload-attachments.sh");
writeFileSync(uploadTarget, renderUploadScript(result.attachments));
console.log(
  `Wrote ${result.sql.length.toLocaleString()} chars to ${sqlTarget}`,
);
console.log(`Wrote upload script to ${uploadTarget}`);
console.log(
  `Stats: ${result.stats.people} people, ${result.stats.emails} emails, ${result.stats.sent} sent, ${result.stats.attachments} attachments`,
);
console.log(
  `Group threads: ${result.stats.groupThreads} (${result.groupMessageCounts.join(" + ")} = ${result.stats.groupMessages} messages)`,
);
console.log(
  `Group person ids: ${result.groupPersonIds[0]} .. ${result.groupPersonIds[result.groupPersonIds.length - 1]} (${result.stats.groupPeople} total)`,
);
console.log(
  `Roster-change demo people: ${result.rosterChangePeopleIds.join(", ")}`,
);
