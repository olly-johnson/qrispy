const STOCKCHARTS_IMAGES = {
  nasi: "https://stockcharts.com/c-sc/sc?s=%24NASI&p=D&yr=0&mn=3&dy=0&i=t2706791378c",
  nymo: "https://stockcharts.com/c-sc/sc?s=%24NYMO&p=D&yr=0&mn=3&dy=0&i=t2706791378c",
} as const;

type StockChartsSymbol = keyof typeof STOCKCHARTS_IMAGES;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const imageUrl = STOCKCHARTS_IMAGES[symbol.toLowerCase() as StockChartsSymbol];

  if (!imageUrl) {
    return new Response("Unsupported StockCharts symbol", { status: 404 });
  }

  const response = await fetch(imageUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer: "https://stockcharts.com/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    },
  });

  if (!response.ok) {
    return new Response("StockCharts image unavailable", { status: 502 });
  }

  const contentType = response.headers.get("content-type") ?? "image/png";

  if (!contentType.startsWith("image/")) {
    return new Response("StockCharts response was not an image", { status: 502 });
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=900",
      "content-type": contentType,
    },
  });
}
