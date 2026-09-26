import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDocument } from "../../doc-to-md/fetch";

describe("fetchDocument", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the response body bytes on success", async () => {
    const body = new TextEncoder().encode("<html>hi</html>");
    const response = { ok: true, arrayBuffer: () => Promise.resolve(body.buffer) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const bytes = await fetchDocument("https://example.com/page");

    expect(new TextDecoder().decode(bytes)).toBe("<html>hi</html>");
  });

  // Some manual hosts refuse a request with no User-Agent, or answer a bare fetch with a
  // different document than a browser gets, so the request identifies itself and asks for what it
  // can convert.
  it("asks with an identifying User-Agent and an Accept for html and pdf", async () => {
    const response = { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await fetchDocument("https://example.com/page");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/page",
      {
        headers: {
          "User-Agent": "tonesmith-doc-to-md (+https://github.com/oparamo/tonesmith)",
          "Accept": "text/html,application/xhtml+xml,application/pdf",
        },
      },
    );
  });

  it("throws with the status text when the response is not ok", async () => {
    const response = { ok: false, status: 404, statusText: "Not Found" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchDocument("https://example.com/missing")).rejects.toThrow("HTTP 404 Not Found");
  });
});
