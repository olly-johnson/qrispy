import { requireUser } from "@/lib/auth/session";
import { getNewsSummaryLlmConfig } from "@/lib/env";
import {
  batchSummarizeGapperNews,
  createOpenAiNewsSummaryProvider,
  resolveNewsSummaryModel,
} from "@/lib/market-data/gapper-news-summary";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";

export const dynamic = "force-dynamic";

type SummaryRequestBody = {
  model?: string;
  provider?: string;
  tickers?: Array<{ previousCloseAt: string; symbol: string }>;
};

export async function POST(request: Request) {
  await requireUser();

  const body = (await request.json()) as SummaryRequestBody;
  const tickers = Array.isArray(body.tickers) ? body.tickers : [];

  if (tickers.length === 0) {
    return Response.json(
      { error: "Select at least one ticker." },
      { status: 400 },
    );
  }

  const configured = getNewsSummaryLlmConfig();
  const selection = resolveNewsSummaryModel({
    requestedModel: body.model ?? configured?.model ?? "gpt-4o-mini",
    requestedProvider: body.provider ?? configured?.provider ?? "openai",
  });

  if (!configured || configured.provider !== selection.provider) {
    return Response.json(
      { error: "Selected news summary provider is not configured." },
      { status: 400 },
    );
  }

  const massive = createMassiveMarketDataProvider();
  if (!massive) {
    return Response.json(
      { error: "Massive API key is not configured." },
      { status: 400 },
    );
  }

  const requests = await Promise.all(
    tickers.map(async (ticker) => {
      const symbol = ticker.symbol.toUpperCase();

      return {
        news: await massive.getTickerNews({
          publishedAfter: ticker.previousCloseAt,
          ticker: symbol,
        }),
        previousCloseAt: ticker.previousCloseAt,
        symbol,
      };
    }),
  );

  const results = await batchSummarizeGapperNews({
    model: selection.model,
    provider: createOpenAiNewsSummaryProvider({ apiKey: configured.apiKey }),
    requests,
  });

  return Response.json({ results });
}
