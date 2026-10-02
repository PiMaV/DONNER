import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { renderAboutMarkdown } from "../src/about-md.js";

const about = readFileSync(new URL("../docs/about.md", import.meta.url), "utf8");
const pages = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
const sync = readFileSync(new URL("../scripts/sync-local-viewer-web.sh", import.meta.url), "utf8");

describe("About markdown", () => {
  it("renders the dialog title, sections, and safe links", () => {
    const html = renderAboutMarkdown(about);
    assert.match(html, /<h2 id="about-title">DONNER<\/h2>/);
    assert.match(html, /<h3>Sources \/ Examples<\/h3>/);
    assert.match(html, /<em>Streaming<\/em>/);
    assert.match(html, /<code>\?src=ignition<\/code>/);
    assert.match(html, /<a href="https:\/\/wetter\.mess\.engineering" target="_blank" rel="noopener noreferrer">WETTER<\/a>/);
    assert.match(html, /<a href="https:\/\/github.com\/PiMaV\/BLITZ" target="_blank" rel="noopener noreferrer">BLITZ<\/a>/);
    assert.match(
      html,
      /<a href="https:\/\/github.com\/PiMaV\/DONNER\/releases" target="_blank" rel="noopener noreferrer">https:\/\/github.com\/PiMaV\/DONNER\/releases<\/a>/,
    );
    assert.match(html, /<a href="data\/NOTICE.md">data\/NOTICE.md<\/a>/);
    assert.doesNotMatch(html, /target="_blank"[^>]*>data\/NOTICE/);
  });

  it("drops non-http links", () => {
    const html = renderAboutMarkdown("[x](javascript:alert(1))");
    assert.equal(html, "<p>x</p>");
  });

  it("is shipped with the static site and the offline host", () => {
    assert.match(pages, /docs\/about\.md/);
    assert.match(sync, /docs\/about\.md/);
  });
});
