import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ManualConfig } from "./config.js";
import type { TocSelectors } from "./toc.js";
import { extractToc } from "./toc.js";
import { htmlToMarkdown } from "./converter.js";

const fetchPage = async (url: string): Promise<string> => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
};

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

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
  const failed: Array<{ url: string; text: string }> = [];

  for (let i = 0; i < toc.length; i++) {
    const { level, url, text } = toc[i]!;
    const prefix = "  ".repeat(level);
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${toc.length}] ${prefix}${text}  `);

    let html: string;
    try {
      html = await fetchPage(url);
    } catch (e) {
      console.info(`FETCH ERROR: ${e instanceof Error ? e.message : e}`);
      failed.push({ url, text });
      continue;
    }

    if (!html.trim()) {
      console.info("EMPTY");
      failed.push({ url, text });
      continue;
    }

    const md = htmlToMarkdown(html);
    if (!md.trim()) {
      console.info("NO TEXT");
      failed.push({ url, text });
      continue;
    }

    // level 0 → ##, 1 → ###, 2 → ####  (# is reserved for the document title)
    const hashes = "#".repeat(level + 2);
    sections.push(`${hashes} ${text}\n\n${md}`);
    console.info(`✓ (${md.length} chars)`);

    if (i < toc.length - 1) await sleep(400);
  }

  const combined = `# ${cfg.title}\n\n` + sections.join("\n\n---\n\n") + "\n";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, combined, "utf-8");

  console.info(`\nWrote: ${outPath}`);
  console.info(`  Sections: ${sections.length}/${toc.length}`);
  console.info(`  Size:     ${combined.length.toLocaleString()} chars`);
  if (failed.length > 0) {
    console.info(`  Failed (${failed.length}):`);
    for (const { url, text } of failed) {
      console.info(`    ${text} — ${url}`);
    }
  }
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
