import { describe, it, expect } from "vitest";
import {
  MAX_SIGNATURE_HTML_LENGTH,
  sanitizeSignatureHtml,
} from "../lib/sanitize-signature";

// These tests exercise the server-side sanitizer used on every
// `signatureHtml` write in admin-inboxes-router. It's the defense
// against a compromised admin token becoming stored-XSS for every
// member's compose drawer and every outbound email. Each test
// targets one class of payload, so regressions are easy to pin to
// a specific gap.

describe("sanitizeSignatureHtml", () => {
  it("preserves benign signature content", async () => {
    const html =
      '<p>Best regards,</p><p><strong>Jane Doe</strong></p><p>VP Engineering · <a href="https://example.com">example.com</a></p>';
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).toContain("<p>");
    expect(cleaned).toContain("<strong>Jane Doe</strong>");
    expect(cleaned).toContain('href="https://example.com"');
  });

  it("returns empty string for empty input", async () => {
    expect(await sanitizeSignatureHtml("")).toBe("");
  });

  it("strips <script> tags entirely (with their contents)", async () => {
    const html = "<p>hi</p><script>alert(1)</script><p>bye</p>";
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toContain("alert(1)");
    expect(cleaned).toContain("<p>hi</p>");
    expect(cleaned).toContain("<p>bye</p>");
  });

  it("strips <iframe>, <object>, <embed>, <form>, <meta>, <link>", async () => {
    const html =
      '<iframe src="//evil"></iframe>' +
      '<object data="x"></object>' +
      '<embed src="x">' +
      "<form><input></form>" +
      '<meta http-equiv="refresh" content="0;url=//evil">' +
      '<link rel="stylesheet" href="//evil">' +
      "<p>safe</p>";
    const cleaned = await sanitizeSignatureHtml(html);
    for (const tag of [
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "meta",
      "link",
    ]) {
      expect(cleaned).not.toMatch(new RegExp(`<${tag}`, "i"));
    }
    expect(cleaned).toContain("<p>safe</p>");
  });

  it("strips on* event-handler attributes from every element", async () => {
    const html =
      '<p onclick="alert(1)" onmouseover="x">a</p>' +
      '<a href="https://ok" onerror="alert(2)">b</a>' +
      '<span ONLOAD="bad">c</span>';
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).not.toMatch(/\bon\w+\s*=/i);
    expect(cleaned).toContain("<p>a</p>");
    expect(cleaned).toContain('href="https://ok"');
    expect(cleaned).toContain("<span>c</span>");
  });

  it("strips `style` attributes (CSS expressions / url(javascript:) vector)", async () => {
    const html =
      '<p style="color: red; background: url(javascript:alert(1))">x</p>';
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).not.toMatch(/\bstyle\s*=/i);
    expect(cleaned).toContain("<p>x</p>");
  });

  it("drops javascript: / vbscript: / data: hrefs", async () => {
    const html =
      '<a href="javascript:alert(1)">a</a>' +
      '<a href="VBSCRIPT:msgbox">b</a>' +
      '<a href="data:text/html,<script>x</script>">c</a>' +
      '<a href="https://safe">d</a>';
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).not.toMatch(/href\s*=\s*"javascript:/i);
    expect(cleaned).not.toMatch(/href\s*=\s*"vbscript:/i);
    expect(cleaned).not.toMatch(/href\s*=\s*"data:/i);
    expect(cleaned).toContain('href="https://safe"');
  });

  it("drops non-image data: src on <img> but keeps data:image/*", async () => {
    const html =
      '<img src="data:image/png;base64,iVBORw0K">' +
      '<img src="data:text/html,<script>x</script>">' +
      '<img src="javascript:alert(1)">' +
      '<img src="https://cdn/ok.png">';
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).toContain('src="data:image/png;base64,iVBORw0K"');
    expect(cleaned).toContain('src="https://cdn/ok.png"');
    expect(cleaned).not.toMatch(/src\s*=\s*"data:text/i);
    expect(cleaned).not.toMatch(/src\s*=\s*"javascript:/i);
  });

  it("strips srcset wholesale (can carry data: payloads)", async () => {
    const html =
      '<img src="https://ok" srcset="data:text/html,<script>x</script> 2x">';
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).not.toMatch(/srcset\s*=/i);
    expect(cleaned).toContain('src="https://ok"');
  });

  it("enforces MAX_SIGNATURE_HTML_LENGTH by truncation", async () => {
    const longBenign =
      "<p>" + "x".repeat(MAX_SIGNATURE_HTML_LENGTH + 5000) + "</p>";
    const cleaned = await sanitizeSignatureHtml(longBenign);
    expect(cleaned.length).toBeLessThanOrEqual(MAX_SIGNATURE_HTML_LENGTH);
  });

  it("is idempotent — running twice produces the same output", async () => {
    const html =
      '<p onclick="x">hi</p><script>1</script><a href="https://ok">a</a>';
    const once = await sanitizeSignatureHtml(html);
    const twice = await sanitizeSignatureHtml(once);
    expect(twice).toBe(once);
  });

  it("does not leak the sentinel wrapper tag into output", async () => {
    const html = "<p>x</p>";
    const cleaned = await sanitizeSignatureHtml(html);
    expect(cleaned).not.toContain("saasmail-sig-root");
  });
});
