#!/usr/bin/env node
/**
 * Fetches a URL and converts its HTML body to Markdown.
 *
 * Usage:
 *   tsx tools/html-to-md/index.ts <url> [-o out.md]
 *
 * Prints to stdout when -o is omitted.
 */
import { writeFileSync } from "node:fs";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { fetchPage } from "./fetch.js";

const [url, ...rest] = process.argv.slice(2);

if (!url) {
  console.error("Usage: tsx tools/html-to-md/index.ts <url> [-o out.md]");
  process.exit(1);
}

const outFlagIndex = rest.indexOf("-o");
const outPath = outFlagIndex !== -1 ? rest[outFlagIndex + 1] : undefined;

const html = await fetchPage(url);
const markdown = NodeHtmlMarkdown.translate(html);

if (outPath) {
  writeFileSync(outPath, markdown, "utf-8");
  console.info(`Wrote: ${outPath} (${markdown.length.toLocaleString()} chars)`);
} else {
  console.info(markdown);
}
