"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const safe = require("../safe.js");

test("safeUrl accepts ordinary links and rejects executable schemes", () => {
  assert.equal(safe.safeUrl("https://example.test/a"), "https://example.test/a");
  assert.equal(safe.safeUrl("/docs/page.html"), "/docs/page.html");
  assert.equal(safe.safeUrl("mailto:info@example.test"), "mailto:info@example.test");
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example/path",
    "java\\nscript:alert(1)",
    "https://example.test/\\evil",
  ]) {
    assert.equal(safe.safeUrl(value, { fallback: "FALLBACK" }), "FALLBACK", value);
  }
});

test("parseRichText removes active markup while retaining safe prose", () => {
  const parsed = safe.parseRichText(
    "<h2>Brief</h2><p>Hello <strong>world</strong>.</p>" +
    "<script>alert('xss')</script>" +
    "<img src=x onerror=alert(1)>" +
    "<a href=\"javascript:alert(2)\" onclick=\"steal()\">bad link</a>" +
    "<constructor>not an element</constructor>" +
    "<a href=\"https://example.test/\">good link</a>"
  );
  const json = JSON.stringify(parsed);
  const attrs = [];
  (function walk(node) {
    Object.keys(node.attrs || {}).forEach((name) => attrs.push(name));
    (node.children || []).forEach(walk);
  })(parsed.root);
  assert.equal(attrs.includes("onerror"), false);
  assert.equal(attrs.includes("onclick"), false);
  assert.equal(JSON.stringify(parsed).includes("javascript:"), false);
  assert.equal(json.includes("\"tag\":\"constructor\""), false);
  assert.match(parsed.text, /Hello world/);
  assert.match(parsed.text, /onerror/);
  assert.match(parsed.text, /bad link/);
  assert.match(parsed.text, /good link/);
  assert.ok(parsed.root.children.some((node) => node.tag === "h2"));
  const links = [];
  (function walk(node) {
    if (node.tag === "a") links.push(node);
    (node.children || []).forEach(walk);
  })(parsed.root);
  assert.ok(links.some((node) => node.attrs.href === "https://example.test/"));
});

test("value helpers are bounded and deterministic", () => {
  assert.equal(safe.isEmail("person@example.test"), true);
  assert.equal(safe.isEmail("not-an-email"), false);
  assert.equal(safe.clampQty("0", 99), 1);
  assert.equal(safe.clampQty("1000", 99), 99);
  assert.equal(safe.isTruthyFlag("yes"), true);
  assert.equal(safe.isTruthyFlag("off"), false);
});
