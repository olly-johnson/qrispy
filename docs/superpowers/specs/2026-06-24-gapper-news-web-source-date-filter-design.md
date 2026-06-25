# Gapper web-source freshness design

## Goal

Only use web-search results that identify a publication time on or after the
selected ticker's previous close. This prevents evergreen earnings pages and
older coverage from being presented as today's catalyst.

## Data flow

1. Massive remains the first source and is unchanged because it already
   receives the previous-close cutoff.
2. When Massive is empty, the OpenAI web-search provider asks for a structured
   list of sources. Each source must include its URL, title, concise finding,
   and a source-stated UTC publication timestamp.
3. The provider validates the timestamp locally. It discards malformed,
   undated, or pre-cutoff entries before returning them to the cascade.
4. If no validated web results remain, the existing X fallback runs. If X is
   also empty, the existing no-news result is returned.

## Cache compatibility

The per-symbol summary cache version advances so summaries created under the
old citation-only contract are not reused after deployment.

## Failure behaviour

An unusable web result is not an error and does not produce a stale summary.
It is treated as no web context, allowing the next fallback layer to run.
Malformed model output remains a request error so it is visible rather than
silently converted to a catalyst.

## Verification

Regression tests will prove that old and undated web entries are rejected,
recent dated entries are retained, and the cascade reaches X after web entries
are rejected. Existing cache tests will verify the new cache namespace.
