#!/usr/bin/env node
/**
 * Generic online-manual → Markdown converter.
 *
 * Usage:
 *   tsx tools/html-to-md/index.ts <config.json> [manual-key ...]
 *   tsx tools/html-to-md/index.ts <config.json> inspect <url>
 *
 * Config file format (JSON):
 *   {
 *     "selectors": {
 *       "tocMenu":    "schema-toc-menu",     // top-level TOC <ul> class
 *       "tocSubmenu": "schema-toc-submenu",  // nested TOC <ul> class
 *       "tocLink":    "schema-toc-link",     // TOC <a> class
 *       "invisible":  "invisible"            // spans to skip in link text
 *     },
 *     "manuals": {
 *       "<key>": {
 *         "toc":    "<path to saved TOC HTML file>",
 *         "output": "<path to write Markdown>",
 *         "title":  "<H1 title for the output file>"
 *       }
 *     }
 *   }
 *
 * Paths in the config are relative to the current working directory (repo root).
 * The TOC HTML files must be saved locally first (download the manual page from the
 * vendor's documentation site and save the full HTML).
 */
import { loadConfig, DEFAULT_SELECTORS } from "./config.js";
import { convertManual, inspectPage } from "./pipeline.js";

const [configArg, ...rest] = process.argv.slice(2);

if (!configArg) {
  console.info("Usage: tsx tools/html-to-md/index.ts <config.json> [key...]\n");
  console.info("  config.json   Path to a manual config file");
  console.info("  key           One or more manual keys to convert (default: all)\n");
  console.info("  inspect <url>  Fetch a URL and print HTML + Markdown preview");
  process.exit(0);
}

const config = loadConfig(configArg);
const selectors = { ...DEFAULT_SELECTORS, ...config.selectors };

if (rest[0] === "inspect") {
  const url = rest[1];
  if (!url) { console.error("inspect requires a URL"); process.exit(1); }
  await inspectPage(url);
  process.exit(0);
}

const keys =
  rest.length > 0
    ? rest.filter(k => {
        if (!(k in config.manuals)) {
          console.warn(`Unknown manual key "${k}" — available: ${Object.keys(config.manuals).join(", ")}`);
          return false;
        }
        return true;
      })
    : Object.keys(config.manuals);

if (keys.length === 0) {
  console.error(`No valid manual keys. Available: ${Object.keys(config.manuals).join(", ")}`);
  process.exit(1);
}

for (const key of keys) {
  await convertManual(config.manuals[key]!, selectors);
}

console.info(`\nDone.`);
