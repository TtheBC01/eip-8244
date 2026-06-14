import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { network } from "hardhat";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML_PATH = join(ROOT, "html", "index.html");

// Mirrors the conservative minify in scripts/build.ts.
function minify(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/^\s+|\s+$/g, "");
}

describe("HelloWorldFrontend", async function () {
  const { viem } = await network.create();

  it("html() returns a self-decompressing bootstrap document", async function () {
    const app = await viem.deployContract("HelloWorldFrontend");
    const doc = await app.read.html();

    assert.match(doc, /^<!doctype html>/i);
    assert.ok(doc.includes('DecompressionStream("gzip")'));
    assert.ok(doc.includes('const B="'));
  });

  it("the stored payload gzip+base64 round-trips back to the source HTML", async function () {
    const app = await viem.deployContract("HelloWorldFrontend");
    const doc = await app.read.html();

    const match = doc.match(/const B="([^"]*)"/);
    assert.ok(match, "could not find embedded base64 payload");

    const gzipped = Buffer.from(match[1], "base64");
    const restored = gunzipSync(gzipped).toString("utf8");

    const expected = minify(readFileSync(HTML_PATH, "utf8"));
    assert.equal(restored, expected);
  });
});
