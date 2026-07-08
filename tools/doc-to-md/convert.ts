import { NodeHtmlMarkdown } from "node-html-markdown";
import pdf2md from "@opendocsg/pdf2md";

type DocFormat = "html" | "pdf";

const PDF_MAGIC = "%PDF-";

const detectFormat = (bytes: Uint8Array, override?: string): DocFormat => {
  if (override === "html" || override === "pdf") return override;
  if (override !== undefined) throw new Error(`Unknown format "${override}" — expected html or pdf`);
  const head = Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1");
  const format = head === PDF_MAGIC ? "pdf" : "html";
  return format;
};

const toMarkdown = async (bytes: Uint8Array, format: DocFormat): Promise<string> => {
  if (format === "pdf") return pdf2md(bytes);
  return NodeHtmlMarkdown.translate(Buffer.from(bytes).toString("utf-8"));
};

export { detectFormat, toMarkdown };
export type { DocFormat };
