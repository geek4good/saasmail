import LegalLayout from "@/components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="May 7, 2026">
      <p>
        <strong>saasmail</strong> is open-source self-hosted email
        infrastructure. These terms apply to your use of the saasmail source
        code, the website at{" "}
        <a
          href="https://github.com/choyiny/saasmail"
          target="_blank"
          rel="noreferrer"
        >
          github.com/choyiny/saasmail
        </a>
        , and any saasmail instance that you choose to deploy. They do
        <strong> not</strong> create an ongoing service relationship between you
        and the saasmail project — there is no centralized saasmail SaaS.
      </p>

      <h2>1. The Software</h2>
      <p>
        saasmail is licensed under the{" "}
        <a
          href="https://github.com/choyiny/saasmail/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          Apache License 2.0
        </a>
        . You may use, copy, modify, distribute, and self-host the software for
        any purpose — commercial or otherwise — provided you comply with the
        license. The full license text governs your rights and obligations and
        prevails over any conflicting language in this document.
      </p>

      <h2>2. Self-hosted, no central service</h2>
      <p>
        Every saasmail deployment runs entirely inside <strong>your</strong>{" "}
        Cloudflare account, using your own bindings (D1, R2, Queues, Durable
        Objects, Email Routing) and any optional outbound provider you
        configure. The saasmail project does not operate any backend that
        receives, stores, or processes email on your behalf.
      </p>
      <p>This means the project maintainers cannot:</p>
      <ul>
        <li>Read, restore, or delete email data on a deployed instance.</li>
        <li>Provision accounts, reset passwords, or unlock lost passkeys.</li>
        <li>Provide uptime or availability guarantees for your deployment.</li>
      </ul>

      <h2>3. Your responsibilities as an operator</h2>
      <p>
        If you deploy saasmail and grant access to other users (teammates,
        customers, etc.), you act as the operator and are solely responsible
        for:
      </p>
      <ul>
        <li>
          Complying with all laws applicable to your processing of email and
          personal data — including, where relevant, GDPR, CCPA/CPRA, CASL,
          CAN-SPAM, and any sector-specific rules.
        </li>
        <li>
          Honoring data-subject rights of people who email your inboxes (access,
          deletion, portability) — the saasmail UI gives you the tools to do
          this; using them is up to you.
        </li>
        <li>
          Configuring authentication (DKIM, SPF, DMARC) and enforcing the terms
          of your underlying providers (Cloudflare, Resend, etc.).
        </li>
        <li>
          Not using saasmail to send unsolicited bulk email or to harass,
          impersonate, or harm others.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>
        You agree not to use saasmail or its source code to send spam, malware,
        or content that is unlawful, harassing, defamatory, or infringing.
        Violation of any third-party provider's terms of service (Cloudflare,
        Resend) is your responsibility, not the project's.
      </p>

      <h2>5. Trademarks</h2>
      <p>
        The name <strong>"saasmail"</strong> and the saasmail logo identify the
        original project. The Apache 2.0 license grants you broad rights to the
        source, but it does <strong>not</strong> grant trademark rights. If you
        fork and run saasmail as your own branded product, please rename it and
        replace the logo so users aren't confused about which project they're
        installing.
      </p>

      <h2>6. Contributions</h2>
      <p>
        Pull requests are welcome. By opening a pull request against the
        upstream repository, you agree that your contribution is licensed to the
        project under the same Apache License 2.0 and that you have the right to
        license it. There is no separate Contributor License Agreement (CLA).
      </p>

      <h2>7. Disclaimer of warranties</h2>
      <p>
        The software is provided <strong>"as is"</strong>, without warranty of
        any kind, express or implied — including warranties of merchantability,
        fitness for a particular purpose, and non-infringement. The project does
        not guarantee that saasmail will be error-free, secure against every
        threat, or fit for your specific use case. You are responsible for
        evaluating and testing it before relying on it.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the saasmail authors and
        contributors are not liable for any direct, indirect, incidental,
        special, consequential, or punitive damages arising out of your use of
        the software — including lost profits, lost data, business interruption,
        or any other commercial damages — even if advised of the possibility of
        such damages.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        These terms may be updated to reflect changes in the project, the
        license, or applicable law. Material changes will be noted in the{" "}
        <a
          href="https://github.com/choyiny/saasmail/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noreferrer"
        >
          project changelog
        </a>
        . Continued use of the software after a change means you accept the
        revised terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        For questions about these terms, open an issue at{" "}
        <a
          href="https://github.com/choyiny/saasmail/issues"
          target="_blank"
          rel="noreferrer"
        >
          github.com/choyiny/saasmail/issues
        </a>
        . For security disclosures, see{" "}
        <a
          href="https://github.com/choyiny/saasmail/blob/main/SECURITY.md"
          target="_blank"
          rel="noreferrer"
        >
          SECURITY.md
        </a>
        .
      </p>
    </LegalLayout>
  );
}
