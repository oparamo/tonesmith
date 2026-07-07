import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPage } from "../fetch";

describe("fetchPage", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the response body text on success", async () => {
    const response = { ok: true, text: () => Promise.resolve("<html>hi</html>") };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const html = await fetchPage("https://example.com/page");

    expect(html).toBe("<html>hi</html>");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/page",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.any(String) as string,
          "Accept": "text/html,application/xhtml+xml",
        }) as Record<string, string>,
      }),
    );
  });

  it("throws with the status text when the response is not ok", async () => {
    const response = { ok: false, status: 404, statusText: "Not Found" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchPage("https://example.com/missing")).rejects.toThrow("HTTP 404 Not Found");
  });
});
