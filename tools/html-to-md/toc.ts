import { parse, HTMLElement, NodeType } from "node-html-parser";

export interface TocEntry {
  level: number;
  url: string;
  text: string;
}

export interface TocSelectors {
  tocMenu: string;
  tocSubmenu: string;
  tocLink: string;
  invisible?: string;
}

const getLinkText = (link: HTMLElement, invisibleClass?: string): string => {
  const parts: string[] = [];
  for (const child of link.childNodes) {
    if (
      invisibleClass &&
      child.nodeType === NodeType.ELEMENT_NODE &&
      (child as HTMLElement).classList.contains(invisibleClass)
    ) {
      continue;
    }
    parts.push(child.rawText ?? "");
  }
  return parts.join("").replace(/\s+/g, " ").trim();
};

const countDepth = (link: HTMLElement, menuClass: string, submenuClass: string): number => {
  let depth = 0;
  let parent = link.parentNode as HTMLElement | null;
  while (parent) {
    const tag = parent.tagName?.toLowerCase();
    if (tag === "ul") {
      if (parent.classList.contains(menuClass)) break;
      if (parent.classList.contains(submenuClass)) depth++;
    }
    parent = parent.parentNode as HTMLElement | null;
  }
  return depth;
};

export const extractToc = (html: string, selectors: TocSelectors): TocEntry[] => {
  const root = parse(html);
  const entries: TocEntry[] = [];

  for (const link of root.querySelectorAll(`.${selectors.tocLink}`)) {
    const url = link.getAttribute("href") ?? "";
    const text = getLinkText(link, selectors.invisible);
    if (!url || !text || text.toLowerCase() === "top") continue;
    const level = countDepth(link, selectors.tocMenu, selectors.tocSubmenu);
    entries.push({ level, url, text });
  }

  // Deduplicate by URL (some TOCs list the same page in multiple spots)
  const seen = new Set<string>();
  return entries.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
};
