import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import TermsModal from "../src/components/TermsModal.jsx";
import termsMarkdown from "../TERMS.md?raw";

const html = renderToStaticMarkup(<TermsModal onClose={() => {}} />);
// Entities the renderer emits for quotes and dashes get in the way of plain
// substring assertions.
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

describe("TermsModal", () => {
  it("renders the terms from TERMS.md rather than a second copy", () => {
    // The anti-drift guard: every section heading in the file must reach the
    // modal. If someone adds a section to TERMS.md and this fails, the modal
    // is no longer showing the whole document.
    const headings = [...termsMarkdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
    expect(headings.length).toBeGreaterThan(5);
    for (const heading of headings) {
      expect(text).toContain(heading.replace(/\*\*/g, "").replace(/\s+/g, " "));
    }
  });

  it("surfaces the human-verification requirement", () => {
    expect(text).toContain("must be independently reviewed and verified by a qualified human");
    expect(text).toContain("not a system of record");
  });

  it("names the publisher and disclaims affiliation", () => {
    expect(text).toContain("Wildtype Technologies LLC");
    expect(text).toContain("New Jersey limited liability company");
    expect(text).toContain("not affiliated with");
  });

  it("keeps the as-is disclaimer and liability limit", () => {
    expect(text).toContain('THE TOOL IS PROVIDED "AS IS"');
    expect(text).toContain("ONE HUNDRED U.S. DOLLARS");
  });

  it("renders markdown instead of leaking its syntax", () => {
    expect(text).not.toContain("**");
    expect(text).not.toMatch(/#{2,}/);
    // Links render as their label, with no dangling target.
    expect(text).not.toContain("](");
    expect(text).toContain("LICENSE");

    expect(html).toContain("<strong");
    expect(html).toContain("<li");
    expect(html).toContain("<hr");
  });

  it("does not print, and is a labelled modal dialog", () => {
    expect(html).toContain("screen-only");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="terms-title"');
  });

  it("scrolls the body, not the whole panel", () => {
    // Regression: the overlay used to be the scroll container with a sticky
    // header, so the panel slid through the viewport and body text passed
    // through the band above the pinned header. The panel is now a bounded
    // flex column -- fixed header and footer, scrolling middle.
    expect(html).not.toContain("sticky");
    expect(html).not.toContain("my-auto");

    const overlay = html.slice(0, html.indexOf(">") + 1);
    expect(overlay).not.toContain("overflow-y-auto");
    expect(overlay).toContain("items-center");

    expect(html).toContain("max-h-full");
    expect(html).toContain("flex flex-col");
    expect(html).toContain("overflow-y-auto grow");
  });

  it("drops the file's own H1 so the title is not doubled", () => {
    const occurrences = text.split("Terms of Service").length - 1;
    expect(occurrences).toBe(1);
  });
});
