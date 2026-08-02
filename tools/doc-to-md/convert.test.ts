import { describe, it, expect } from "vitest";
import { detectFormat, toMarkdown } from "./convert";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * Builds a minimal one-page PDF containing `text`, with a correctly computed
 * xref table (ASCII-only content, so string lengths equal byte offsets).
 */
const makePdf = (text: string): Uint8Array => {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, content] of objects.entries()) {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${content}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries}` +
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF`;
  return encode(body);
};

describe("detectFormat", () => {
  it("detects PDF content from its magic bytes", () => {
    expect(detectFormat(makePdf("x"))).toBe("pdf");
  });

  it("defaults non-PDF content to html", () => {
    expect(detectFormat(encode("<html><body>hi</body></html>"))).toBe("html");
  });

  it("lets an explicit override win over content sniffing", () => {
    expect(detectFormat(encode("<html></html>"), "pdf")).toBe("pdf");
    expect(detectFormat(makePdf("x"), "html")).toBe("html");
  });

  it("rejects an unknown format override", () => {
    expect(() => detectFormat(encode("hi"), "docx")).toThrow(/docx/);
  });
});

describe("toMarkdown", () => {
  it("converts HTML structure to Markdown", async () => {
    const html = "<h1>Manual</h1><p>Turn the <strong>gain</strong> knob.</p>";

    const markdown = await toMarkdown(encode(html), "html");

    expect(markdown).toContain("# Manual");
    expect(markdown).toContain("**gain**");
  });

  it("extracts text from a PDF document", async () => {
    const markdown = await toMarkdown(makePdf("Tonesmith PDF Fixture"), "pdf");

    expect(markdown).toContain("Tonesmith PDF Fixture");
  });
});
