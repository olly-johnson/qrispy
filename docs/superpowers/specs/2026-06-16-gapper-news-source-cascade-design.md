# Gapper News Source Cascade Design

## Goal

Improve `/gappers` news summaries so each selected ticker can explain direct news, broader market context, and last-resort social chatter without turning every request into an expensive broad search. Replace the current text blob with a compact structured card centered on one clear reason the stock is gapping today.

## Source Cascade

Each selected ticker uses a strict source order:

1. Massive ticker news after the previous regular-session close.
2. Web search only when Massive returns no usable articles.
3. X search only when both Massive and web search return no usable sources.

The server stops at the first source layer with usable results. A ticker that has Massive articles never calls web search or X. A ticker with web results never calls X. This keeps cost predictable and keeps higher-noise sources out of normal summaries.

## Source Layer Semantics

The response includes a `sourceLayer` field with one of:

- `massive`
- `web`
- `x`
- `none`

Massive and web sources can support direct claims and broader context. X sources are social context only. When the source layer is `x`, the prompt and UI must avoid presenting claims as confirmed facts unless the X result itself links to or quotes a credible source.

## Web Search Behavior

The first implementation should use OpenAI web search because the app already depends on `OPENAI_API_KEY` for summaries. Keep the retrieval interface provider-shaped so Brave, Exa, Tavily, or another search API can replace or supplement OpenAI later.

For each ticker, web search should look for:

- Direct ticker news since the previous close.
- "Why is `<symbol>` up today" style results.
- Company name plus catalyst terms such as earnings, guidance, contract, FDA, merger, analyst upgrade, offering, and short report.
- Contextual links from peers, sector leaders, commodities, indexes, or macro events when direct news is absent. Examples: AMD can move with NVDA earnings; oil names can move with war or supply-risk headlines.

The web search layer returns normalized source records with title, URL, publisher when available, published time when available, snippet/content, and a reason it was selected.

## X Search Behavior

X is optional and disabled unless server configuration is present:

- `NEWS_SUMMARY_X_ENABLED=true`
- `X_API_BEARER_TOKEN`

If X is disabled or unconfigured, the cascade skips it and returns `sourceLayer: "none"` when Massive and web have no sources.

X queries should be narrow and ticker-specific, for example `$AMD stock why up today`, and should limit results to recent posts after the previous close where the API supports time filtering. The X layer should favor posts from known market-news accounts, company accounts, verified journalists, analysts, and posts linking to primary or reputable sources. It should filter low-signal posts where possible.

## Structured Summary Result

The API returns structured summary data rather than pre-rendered text. Each ticker result contains:

- `symbol`
- `status`: `success`, `no_news`, or `error`
- `sourceLayer`
- `headline`: one sentence answering why the stock is gapping today
- `catalysts`: one to three concise catalyst bullets
- `earnings`: nullable structured EPS/revenue data
- `guidance`: nullable structured next-quarter and full-year data
- `sources`: compact normalized source metadata
- `confidence`: `high`, `medium`, or `low`

`headline` should be useful on its own. Example: "AMD is gapping up in sympathy with NVDA after strong AI earnings lifted semiconductor sentiment."

## Earnings And Guidance Rendering

Hide the earnings/guidance section unless the source set actually contains earnings or guidance reported since the previous close. Do not render lines such as `Adjusted EPS NA / YoY NA / Beat NA` when the ticker is moving on an analyst upgrade, peer sympathy, macro context, or social chatter.

When earnings or guidance exists, keep deterministic calculations in app code:

```text
yoyPercent = priorYear === 0 ? null : ((actual - priorYear) / Math.abs(priorYear)) * 100
beatPercent = estimate === 0 ? null : ((actual - estimate) / Math.abs(estimate)) * 100
```

The LLM must not infer missing numbers. Missing numeric fields remain `null`.

## UI Rendering

Each summary panel should render as a compact card:

- Small source layer/confidence badge near the symbol.
- One-line headline at the top.
- `Catalysts` section with one to three bullets.
- `Earnings` or `Guidance` section only when real data exists.
- Sources as small, muted grey footer links with title, publisher/date when available, and URL.

The UI should not use `<pre>` for successful summaries. Error states can stay simple and readable.

## Caching

Use the existing per-symbol local cache behavior, but include the selected source layer/result signature in the cache key or payload so a cached `none` result does not mask newly available Massive or web results after refresh. The premarket-open reset from the companion cache change should apply to all source layers.

Manual refresh should bypass or replace stale source results for selected tickers.

## Error Handling

- Massive missing or failing: return a clear per-batch or per-ticker data-source error only when Massive is required and unavailable. Do not silently skip Massive because web search exists; Massive remains the primary source.
- Web search missing config: skip web search and proceed to X only if X is enabled.
- X missing config: skip X.
- All layers empty: return `status: "no_news"`, `sourceLayer: "none"`, and a concise message that no Massive, web, or X context was found.
- One ticker failing must not fail other selected tickers.

## Testing

Use TDD for implementation.

Core tests:

- Massive results prevent web and X calls.
- Empty Massive results trigger web search.
- Empty Massive and empty web results trigger X only when configured.
- Missing X config skips X and returns `no_news` after Massive and web are empty.
- Web or X results are normalized into the same source shape passed to the summarizer.
- The summarizer prompt includes source-layer rules and social-context cautions for X.
- The API returns structured summary fields rather than rendered text.
- The UI hides earnings/guidance sections when all values are null.
- The UI renders headline, catalyst bullets, badges, and muted source links.
- Cache restore/save continues to work for the structured result shape.

