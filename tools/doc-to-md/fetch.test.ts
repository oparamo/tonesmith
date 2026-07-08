import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDocument } from "./fetch";

describe("fetchDocument", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the response body bytes on success", async () => {
    const body = new TextEncoder().encode("<html>hi</html>");
    const response = { ok: true, arrayBuffer: () => Promise.resolve(body.buffer) };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const bytes = await fetchDocument("https://example.com/page");

    expect(new TextDecoder().decode(bytes)).toBe("<html>hi</html>");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.any(String) as string,
          "Accept": "text/html,application/xhtml+xml,application/pdf",
        }) as Record<string, string>,
      }),
    );
  });

  it("throws with the status text when the response is not ok", async () => {
    const response = { ok: false, status: 404, statusText: "Not Found" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchDocument("https://example.com/missing")).rejects.toThrow("HTTP 404 Not Found");
  });
});
