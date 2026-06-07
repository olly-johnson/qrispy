# Gapper News Summaries Design

## Goal

Add multi-ticker news summaries to the `/gappers` page. The user can select one or more gapper rows and request summaries in parallel. Each summary explains the news catalysts published after the previous regular-session close that may explain the ticker's current move.

## Selection Flow

- Add checkboxes to gapper table rows.
- Add a `Summarise selected` action above the table.
- The action is disabled when no rows are selected.
- Summaries run in parallel on the server with a small concurrency cap so multiple selected tickers complete quickly without overwhelming Massive or the LLM API.
- Each selected ticker gets its own summary panel with loading, success, and error states.

## News Window

For each ticker, fetch news where:

- The article is associated with the selected ticker.
- `published_utc` is strictly after the previous regular-session close.
- Results are sorted by `published_utc` descending.

The selected gapper row should provide the symbol, previous close, current price, and the previous-close cutoff timestamp if available. If the exact cutoff timestamp is not available, the server derives it from the current market date in Eastern time.

## Data Sources

- Use Massive's stock news endpoint first.
- Use Massive API keys server-side only.
- Use an LLM provider server-side only for structured catalyst extraction.
- Do not call LLM providers directly from the browser.

## LLM Provider And Model Selection

Provide a configurable LLM summarizer layer rather than coupling the feature to one provider.

Server configuration:

- `NEWS_SUMMARY_LLM_PROVIDER` selects the default provider.
- `NEWS_SUMMARY_LLM_MODEL` selects the default model.
- Provider-specific keys remain server-side, for example `OPENAI_API_KEY`.

UI behavior:

- Add provider/model controls near `Summarise selected`.
- Default to the server-configured provider and model.
- Allow the user to switch provider and model before running summaries.
- Send only the selected provider/model identifiers to the server, never API keys.

Provider support:

- The first implementation should support OpenAI with Structured Outputs.
- The interface should allow additional providers later if they can return strict JSON or can be wrapped with validation/retry.
- If a selected provider is not configured, show a per-batch summarizer configuration error before running ticker jobs.
- If a selected model does not support strict structured output, either hide it from the selectable list or reject it with a clear error.

## Structured Extraction

The LLM returns strict JSON, not final display text. It should extract only values supported by the supplied news text and return `null` for unavailable facts.

For each ticker, the structured result contains:

- Earnings fields:
  - adjusted EPS actual, prior-year value, consensus estimate
  - revenue actual, prior-year value, consensus estimate
- Guidance fields:
  - next-quarter EPS guidance text
  - next-quarter revenue guidance text
  - full-year EPS guidance text
  - full-year revenue guidance text
- Notable news items.
- Distinct catalysts with type, concise summary, and source article ids.

The prompt must instruct the model not to infer missing numbers. If a number is not explicitly stated in the supplied article summaries/text, it must be `null`.

## Deterministic Rendering

The app calculates derived percentages after structured extraction:

```text
yoyPercent = priorYear === 0 ? null : ((actual - priorYear) / Math.abs(priorYear)) * 100
beatPercent = estimate === 0 ? null : ((actual - estimate) / Math.abs(estimate)) * 100
```

This intentionally handles a prior-year loss turning into a gain by dividing the difference by the absolute value of the original negative number.

Render every summary with the same lines:

```text
Adjusted EPS <actual or NA> / YoY <computed or NA> / Beat <computed or NA>
Rev <actual or NA> / YoY <computed or NA> / Beat <computed or NA>
Guidance Next Quarter: EPS <value or NA> / Rev <value or NA>
Full year guidance: EPS <value or NA> / Rev <value or NA>
Notable News: <one or more concise items, or NA>
Other Catalysts:
- <type>: <summary>
Sources:
- <source title> (<published time>) <url>
```

If there are multiple catalysts since the previous close, report each material catalyst rather than collapsing everything into one sentence.

## Caching

Cache summaries by:

```text
symbol | previousCloseAt | latestArticlePublishedAt
```

This avoids repeated LLM calls when the same ticker is selected again and no newer article has appeared. A manual refresh should bypass or refresh the cached entry.

## Error Handling

- Missing Massive key: show a per-summary data-source error.
- Missing OpenAI key: show a per-summary summarizer configuration error.
- No news since previous close: render deterministic `NA` earnings/guidance lines and `Notable News: No news found since previous close.`
- LLM extraction failure: show the ticker summary as failed without blocking other selected tickers.
- Partial ticker failures do not cancel other selected ticker summaries.

## Testing

Use TDD for implementation.

Core tests:

- News API request filters ticker and previous-close cutoff correctly.
- Batch summarization runs all selected tickers and preserves per-symbol success/error results.
- Provider/model selection is sent to the server and resolved through a server-side allowlist.
- Unconfigured providers and unsupported models return clear errors without exposing keys.
- Distinct catalysts are preserved when more than one material catalyst exists.
- Earnings rendering uses `NA` when values are missing.
- YoY and beat calculations are performed in code, including loss-to-gain YoY.
- The LLM prompt/schema rejects unsupported free-form numeric hallucination by requiring nullable fields and deterministic rendering.
