import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ManualConfig } from "./config.js";
import type { TocEntry, TocSelectors } from "./toc.js";
import { extractToc } from "./toc.js";
import { htmlToMarkdown } from "./converter.js";

const fetchPage = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.text();
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Fetches and converts one TOC entry to a Markdown section. Returns null (after logging why) on failure. */
const convertPage = async (entry: TocEntry, index: number, total: number): Promise<string | null> => {
  const { level, url, text } = entry;
  const prefix = "  ".repeat(level);
  process.stdout.write(`  [${String(index + 1).padStart(3)}/${total}] ${prefix}${text}  `);

  let html: string;
  try {
    html = await fetchPage(url);
  } catch (error) {
    console.info(`FETCH ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  if (!html.trim()) { console.info("EMPTY"); return null; }

  const md = htmlToMarkdown(html);
  if (!md.trim()) { console.info("NO TEXT"); return null; }

  console.info(`✓ (${md.length} chars)`);
  // level 0 → ##, 1 → ###, 2 → ####  (# is reserved for the document title)
  const hashes = "#".repeat(level + 2);
  return `${hashes} ${text}\n\n${md}`;
};

const printSummary = (
  outPath: string,
  combined: string,
  sectionCount: number,
  toc: TocEntry[],
  failed: { url: string; text: string }[],
): void => {
  console.info(`\nWrote: ${outPath}`);
  console.info(`  Sections: ${sectionCount}/${toc.length}`);
  console.info(`  Size:     ${combined.length.toLocaleString()} chars`);
  if (failed.length === 0) return;
  console.info(`  Failed (${failed.length}):`);
  for (const { url, text } of failed) {
    console.info(`    ${text} — ${url}`);
  }
};

export const convertManual = async (cfg: ManualConfig, selectors: TocSelectors): Promise<void> => {
  const tocPath = resolve(cfg.toc);
  const outPath = resolve(cfg.output);

  console.info(`\n${"=".repeat(60)}`);
  console.info(`Converting: ${cfg.title}`);
  console.info(`TOC source: ${tocPath}`);

  if (!existsSync(tocPath)) {
    console.error(`TOC file not found: ${tocPath}`);
    console.error("Save the manual's table-of-contents page as a local HTML file first.");
    return;
  }

  const tocHtml = readFileSync(tocPath, "utf-8");
  const toc = extractToc(tocHtml, selectors);
  console.info(`Pages found in TOC: ${toc.length}`);

  const sections: string[] = [];
  const failed: { url: string; text: string }[] = [];

  for (let i = 0; i < toc.length; i++) {
    const entry = toc[i];
    const section = await convertPage(entry, i, toc.length);
    if (section === null) {
      failed.push({ url: entry.url, text: entry.text });
    } else {
      sections.push(section);
    }
    if (i < toc.length - 1) await sleep(400);
  }

  const combined = `# ${cfg.title}\n\n` + sections.join("\n\n---\n\n") + "\n";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, combined, "utf-8");

  printSummary(outPath, combined, sections.length, toc, failed);
};

export const inspectPage = async (url: string): Promise<void> => {
  console.info(`Fetching: ${url}`);
  const html = await fetchPage(url);
  if (!html) { console.info("Empty response."); return; }

  console.info(`\n--- RAW HTML (first 3000 chars) ---\n`);
  console.info(html.slice(0, 3000));
  console.info(`\n--- CONVERTED MARKDOWN ---\n`);
  const md = htmlToMarkdown(html);
  console.info(md.length > 3000 ? md.slice(0, 3000) + "\n...(truncated)" : md);
};
