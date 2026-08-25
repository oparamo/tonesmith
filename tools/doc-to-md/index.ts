#!/usr/bin/env node
/**
 * Converts a documentation source (HTML page or PDF) to Markdown.
 *
 * Usage:
 *   tsx tools/doc-to-md/index.ts <url|file> [-o out.md] [--format html|pdf]
 *
 * The source may be an http(s) URL or a local file path. HTML vs PDF is
 * detected from the content itself (PDF magic bytes); --format overrides.
 * Prints to stdout when -o is omitted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fetchDocument } from "./fetch.js";
import { detectFormat, toMarkdown } from "./convert.js";

const [source, ...flagArgs] = process.argv.slice(2);

if (!source) {
  console.error("Usage: tsx tools/doc-to-md/index.ts <url|file> [-o out.md] [--format html|pdf]");
  process.exit(1);
}

const outFlagIndex = flagArgs.indexOf("-o");
const outPath = outFlagIndex !== -1 ? flagArgs[outFlagIndex + 1] : undefined;
const formatFlagIndex = flagArgs.indexOf("--format");
const formatOverride = formatFlagIndex !== -1 ? flagArgs[formatFlagIndex + 1] : undefined;

const isUrl = /^https?:\/\//.test(source);
const bytes = isUrl ? await fetchDocument(source) : new Uint8Array(readFileSync(source));
const markdown = await toMarkdown(bytes, detectFormat(bytes, formatOverride));

if (outPath) {
  writeFileSync(outPath, markdown, "utf-8");
  console.info(`Wrote: ${outPath} (${markdown.length.toLocaleString()} chars)`);
} else {
  console.info(markdown);
}
