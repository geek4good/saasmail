import LegalLayout from "@/components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 7, 2026">
      <p>
        <strong>saasmail</strong> is open-source software that runs in your own
        Cloudflare account. The saasmail project does <strong>not</strong>{" "}
        operate a centralized service and does not collect, receive, or store
        any data from saasmail deployments. This policy explains how data flows
        through a typical deployment so you can evaluate it for your own use,
        and what limited information the project's website and repository
        collect.
      </p>

      <h2>1. Who is the data controller?</h2>
      <p>
        Because saasmail is self-hosted, <strong>the operator</strong> — the
        person or organization that deploys saasmail to a Cloudflare account —
        is the data controller for any personal data processed by that
        deployment. The saasmail project is not a processor or sub-processor; it
        provides source code only.
      </p>
      <p>
        If you are using a saasmail instance that someone else operates (for
        example, your employer), questions about your personal data should be
        directed to that operator, not to the project.
      </p>

      <h2>2. What a saasmail deployment processes</h2>
      <p>
        When you deploy saasmail, the following categories of data flow through
        Cloudflare bindings configured in your <code>wrangler.jsonc</code>:
      </p>
      <ul>
        <li>
          <strong>Inbound email content</strong> — subject, headers, body (plain
          text and sanitized HTML), and attachments — received via Cloudflare
          Email Routing and stored in your D1 database and R2 bucket.
        </li>
        <li>
          <strong>Sender metadata</strong> — names and email addresses of people
          who email your configured inboxes, plus aggregated counts (total
          messages, unread count, last activity time).
        </li>
        <li>
          <strong>Outbound email</strong> — messages composed and sent through
          the UI or API, persisted in your D1 database. Delivery is performed by
          Cloudflare Email Sending or Resend, depending on how you configure the
          deployment.
        </li>
        <li>
          <strong>Authentication state</strong> — user accounts (name, email,
          hashed credentials), session tokens, and registered passkeys, all
          managed by{" "}
          <a
            href="https://www.better-auth.com/"
            target="_blank"
            rel="noreferrer"
          >
            Better Auth
          </a>{" "}
          and stored in D1.
        </li>
        <li>
          <strong>Push subscriptions</strong> — if you opt in to browser push
          notifications, the VAPID-encrypted endpoint and keys for your device
          are stored so the worker can deliver alerts.
        </li>
      </ul>
      <p>
        All of this data lives in your Cloudflare account. The saasmail
        maintainers have no access to it.
      </p>

      <h2>3. Where data is stored</h2>
      <p>
        Data persistence in a saasmail deployment is handled entirely by
        Cloudflare services that the operator provisions:
      </p>
      <ul>
        <li>
          <strong>Cloudflare D1</strong> (SQLite) — relational data: inboxes,
          people, emails, sequences, templates, sessions.
        </li>
        <li>
          <strong>Cloudflare R2</strong> — email attachments stored as opaque
          objects.
        </li>
        <li>
          <strong>Cloudflare Queues</strong> — scheduled outbound emails for
          sequence campaigns.
        </li>
        <li>
          <strong>Cloudflare Durable Objects</strong> — short-lived per-user
          notification state for live updates.
        </li>
      </ul>
      <p>
        Cloudflare's own privacy practices apply to this storage; see{" "}
        <a
          href="https://www.cloudflare.com/privacypolicy/"
          target="_blank"
          rel="noreferrer"
        >
          cloudflare.com/privacypolicy
        </a>
        .
      </p>

      <h2>4. Cookies and local storage</h2>
      <p>
        A deployed saasmail instance sets a single first-party session cookie
        issued by Better Auth to keep signed-in members authenticated. The
        cookie is HTTP-only, scoped to the deployment's domain, and contains no
        third-party identifiers. Local browser storage is used to remember UI
        preferences (e.g. sidebar collapsed state). No third-party analytics,
        tracking pixels, or advertising cookies are loaded.
      </p>

      <h2>5. Outbound providers</h2>
      <p>
        If the operator enables outbound email, message bodies and recipients
        are passed to one of the following on send:
      </p>
      <ul>
        <li>
          <strong>Cloudflare Email Sending</strong> — see Cloudflare's privacy
          policy.
        </li>
        <li>
          <strong>Resend</strong> — see{" "}
          <a
            href="https://resend.com/legal/privacy-policy"
            target="_blank"
            rel="noreferrer"
          >
            resend.com/legal/privacy-policy
          </a>
          . The operator's API key is stored as a Cloudflare Worker secret and
          is never exposed to the browser.
        </li>
      </ul>

      <h2>6. Data subject rights</h2>
      <p>
        Where applicable law gives you rights over your personal data — such as
        access, correction, deletion, portability, or objection — those rights
        are exercised against the operator of the saasmail instance you're
        communicating with, not the project. The saasmail UI provides admins
        with the tools to honor these requests (per-person view, per-email
        delete, person-level delete).
      </p>

      <h2>7. Children</h2>
      <p>
        saasmail is professional infrastructure software and is not directed to
        children under 16. The project does not knowingly collect data from
        children. Operators should ensure their deployment's audience is
        appropriate.
      </p>

      <h2>8. Project website and repository</h2>
      <p>
        The project's GitHub repository is hosted by GitHub, Inc. and is subject
        to{" "}
        <a
          href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
          target="_blank"
          rel="noreferrer"
        >
          GitHub's privacy statement
        </a>
        . The project itself does not run analytics, embed third-party tracking,
        or sell any data.
      </p>

      <h2>9. Security</h2>
      <p>
        Source-code-level security disclosures should follow the process in{" "}
        <a
          href="https://github.com/choyiny/saasmail/blob/main/SECURITY.md"
          target="_blank"
          rel="noreferrer"
        >
          SECURITY.md
        </a>
        . Operators are responsible for the security of their own deployment,
        including credentials, secrets, and access controls.
      </p>

      <h2>10. Changes</h2>
      <p>
        Material updates to this policy will be noted in the{" "}
        <a
          href="https://github.com/choyiny/saasmail/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
        >
          project changelog
        </a>
        .
      </p>

      <h2>11. Contact</h2>
      <p>
        For questions about this policy, open an issue at{" "}
        <a
          href="https://github.com/choyiny/saasmail/issues"
          target="_blank"
          rel="noreferrer"
        >
          github.com/choyiny/saasmail/issues
        </a>
        .
      </p>
    </LegalLayout>
  );
}
