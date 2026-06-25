import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TocSelectors } from "./toc.js";

export interface ManualConfig {
  toc: string;
  output: string;
  title: string;
}

export interface Config {
  selectors?: Partial<TocSelectors>;
  manuals: Record<string, ManualConfig>;
}

export const DEFAULT_SELECTORS: TocSelectors = {
  tocMenu:    "schema-toc-menu",
  tocSubmenu: "schema-toc-submenu",
  tocLink:    "schema-toc-link",
  invisible:  "invisible",
};

export const loadConfig = (configPath: string): Config => {
  try {
    return JSON.parse(readFileSync(resolve(configPath), "utf-8")) as Config;
  } catch (e) {
    console.error(`Failed to read config: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
};
