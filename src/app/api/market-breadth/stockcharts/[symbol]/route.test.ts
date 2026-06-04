import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("StockCharts market breadth image route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies allowed StockCharts symbols as PNG responses", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetcher = vi.fn().mockResolvedValue(
      new Response(png, {
        headers: { "content-type": "image/png" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ symbol: "nymo" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(fetcher).toHaveBeenCalledWith(
      "https://stockcharts.com/c-sc/sc?s=%24NYMO&p=D&yr=0&mn=3&dy=0&i=t2706791378c",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining("image/"),
          referer: "https://stockcharts.com/",
          "user-agent": expect.stringContaining("Mozilla"),
        }),
      }),
    );
  });

  it("rejects unsupported symbols", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ symbol: "bad" }),
    });

    expect(response.status).toBe(404);
  });
});
