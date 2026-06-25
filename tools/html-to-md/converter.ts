import { parse, HTMLElement, Node, NodeType } from "node-html-parser";

const SKIP_TAGS = new Set([
  "script", "style", "nav", "header", "footer",
  "noscript", "iframe", "button", "form",
]);

const BLOCK_TAGS = new Set([
  "div", "section", "article", "main", "blockquote",
  "figure", "figcaption", "address", "aside",
]);

const wrapBlock = (inner: string): string => {
  const text = inner.trim();
  return text ? `\n${text}\n\n` : "";
};

const collapseBlankLines = (text: string): string => text.replace(/\n{3,}/g, "\n\n");

const tableToMd = (table: HTMLElement): string => {
  const rows: Array<{ cells: string[]; isHeader: boolean }> = [];

  for (const row of table.querySelectorAll("tr")) {
    const isHeader =
      row.closest("thead") !== null ||
      row.querySelectorAll("th").length > 0;
    const cells = row
      .querySelectorAll("th,td")
      .map(c => c.innerText.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|"));
    if (cells.length > 0) rows.push({ cells, isHeader });
  }

  if (rows.length === 0) return "";

  const maxCols = Math.max(...rows.map(r => r.cells.length));
  const pad = (cells: string[]): string[] => {
    const out = [...cells];
    while (out.length < maxCols) out.push("");
    return out;
  };

  const hasHeader = rows.some(r => r.isHeader);
  let headerRow: string[];
  let bodyRows: string[][];

  if (hasHeader) {
    headerRow = pad(rows.find(r => r.isHeader)!.cells);
    bodyRows = rows.filter(r => !r.isHeader).map(r => pad(r.cells));
  } else {
    headerRow = pad(rows[0]!.cells);
    bodyRows = rows.slice(1).map(r => pad(r.cells));
  }

  const fmt = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const sep = `| ${Array(maxCols).fill("---").join(" | ")} |`;

  return [
    "",
    fmt(headerRow),
    sep,
    ...bodyRows.map(fmt),
    "",
    "",
  ].join("\n");
};

const nodeToMd = (node: Node, listDepth: number): string => {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return node.rawText.replace(/[ \t]+/g, " ");
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? "";
  if (!tag || SKIP_TAGS.has(tag)) return "";

  const children = (depth = listDepth) =>
    el.childNodes.map(c => nodeToMd(c, depth)).join("");

  switch (tag) {
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
      const level = Math.min(parseInt(tag[1]!) + 2, 6);
      const text = children().replace(/\s+/g, " ").trim();
      return text ? `\n${"#".repeat(level)} ${text}\n\n` : "";
    }

    case "p":
      return wrapBlock(children());

    case "strong": case "b":
      return `**${children()}**`;

    case "em": case "i":
      return `*${children()}*`;

    case "code":
      return `\`${el.innerText}\``;

    case "pre":
      return `\n\`\`\`\n${el.innerText}\n\`\`\`\n\n`;

    case "br":
      return "\n";

    case "ul": case "ol":
      return "\n" + el.childNodes
        .filter(c => c.nodeType === NodeType.ELEMENT_NODE &&
          (c as HTMLElement).tagName?.toLowerCase() === "li")
        .map(c => nodeToMd(c, listDepth + 1))
        .join("") + "\n";

    case "li": {
      const indent = "  ".repeat(Math.max(listDepth - 1, 0));
      const text = children(listDepth).replace(/\n+/g, " ").trim();
      return `${indent}- ${text}\n`;
    }

    case "table":
      return tableToMd(el);

    case "thead": case "tbody": case "tfoot":
    case "tr": case "th": case "td":
      // handled inside tableToMd
      return children();

    case "a":
      return children(); // strip links, keep text

    default:
      if (BLOCK_TAGS.has(tag)) return wrapBlock(children());
      return children();
  }
};

export const htmlToMarkdown = (html: string): string => {
  const root = parse(html);
  const body = root.querySelector("body") ?? root;
  return collapseBlankLines(nodeToMd(body, 0)).trim();
};
