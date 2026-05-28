# Evaluator

The evaluator remains the core IP, but it now runs inside a hosted web architecture. It should be built as versioned, idempotent job steps that read/write Supabase Postgres.

Three layers per closed trade:

1. LLM-assisted classification.
2. Deterministic quantitative checks.
3. Nuanced LLM coaching narrative.

## Runtime Shape

Each evaluation is a job pipeline:

```text
trade_closed
  -> ensure_market_data
  -> classify_trade
  -> quantitative_evaluation
  -> narrative_coaching
  -> report_update
```

Each step:

- reads from Postgres,
- writes a versioned row,
- records model/prompt/evaluator version,
- can be retried safely,
- does not depend on local files at runtime except deployed or stored KB markdown.

## Inputs

Per trade:

- normalized fills and reconstructed trade summary,
- account equity snapshot nearest entry,
- cached daily and intraday OHLCV,
- SPY/QQQ/IWM context,
- optional sector/theme context,
- relevant Qullamaggie Method Wiki pages,
- relevant Personal Trading Wiki pages or recent personal pattern summaries,
- user annotations: intended setup, thesis, initial stop, screenshots.

## Layer 1: Classification

Purpose:

- classify setup: `episodic_pivot`, `breakout_flag_wedge`, `parabolic_short`, `other`, `unclear`;
- identify market regime and sector/theme context;
- return uncertainty and evidence.

Draft prompt:

```text
You are classifying a closed trade for a trading coaching app.

Use Qullamaggie's methodology, but do not force every trade into one of his setups.

Return structured markdown with:
- setup_type: one of episodic_pivot, breakout_flag_wedge, parabolic_short, other, unclear
- confidence: 0.0 to 1.0
- direction_fit: why the direction fits or does not fit the setup
- market_context: SPY/QQQ/IWM regime at entry
- sector_or_theme_context: if visible from supplied data
- key_evidence: bullet list of facts from the trade and market data
- missing_evidence: what would change the classification

Trade:
{trade_summary}

Market data:
{market_context}

Candidate setup facts:
{computed_setup_features}

Relevant method wiki excerpts:
{method_wiki_excerpts}

Personal trading context:
{personal_wiki_excerpts_or_recent_patterns}

Be conservative. If evidence is mixed, say unclear and explain the two most likely interpretations.
```

## Layer 2: Quantitative Checks

Each check stores:

- raw metric,
- score 0-1,
- confidence 0-1,
- missing-input flag,
- setup applicability,
- evaluator version.

Core checks:

- liquidity/dollar volume,
- ADR%,
- prior move strength,
- consolidation duration,
- consolidation tightness,
- relative strength versus SPY/QQQ/IWM,
- EP gap percentage,
- EP opening relative volume,
- entry extension above pivot/ORH in ATR or ADR units,
- initial stop width versus ATR/ADR,
- initial R risked as % of account,
- position size as % of account,
- partials around source-supported 3-5 day momentum burst and provisional 3-5R window,
- stop moved to breakeven after partials,
- trailing stop behavior versus 10/20-day moving average,
- holding period versus setup norm.

Score combination:

```text
applicable_scores = checks where setup_applicability > 0 and missing_input is false
weighted_score = sum(score * weight * confidence * setup_applicability)
                 / sum(weight * confidence * setup_applicability)
```

The overall score is secondary. The UI and coaching layer should show the individual metrics.

Suggested weights for milestone 1:

| Check group | Weight |
| --- | ---: |
| setup/context fit | 20 |
| entry quality | 20 |
| risk/stop quality | 25 |
| liquidity/ADR suitability | 10 |
| exit/partials/trailing | 15 |
| market regime | 10 |

## Layer 3: Coaching Narrative

Purpose:

- explain why deviations matter,
- identify when a deviation may have been justified,
- avoid pass/fail dogma,
- cite method wiki pages and personal evidence separately.

Draft prompt:

```text
You are a trading coach evaluating one of my closed trades against Qullamaggie's methodology.

Tone:
- direct, specific, practical
- not motivational fluff
- not pass/fail dogma
- explain why each deviation mattered in context
- explicitly recognize justified rule-bending

Use this framing:
"Kris probably would/wouldn't have done this because X, though he might accept it if Y."

Inputs:

Trade summary:
{trade_summary}

Classification:
{classification}

Quantitative evaluation:
{quantitative_scores}

Relevant method wiki excerpts:
{method_wiki_excerpts}

Personal trading context:
{personal_wiki_excerpts_or_recent_patterns}

User notes, if any:
{user_notes}

Write:
1. One-sentence verdict.
2. What matched the method.
3. The most important deviations, ordered by impact.
4. Whether each deviation was probably justified.
5. One concrete adjustment for next time.
6. Citations separated into:
   - Kris says: method wiki citations
   - Your history shows: personal wiki, trade id, or report citations
   - Qrispy infers: uncited coaching inference based on the above

Do not invent missing data. If an important input is absent, say how that limits confidence.
```

## Attribution Rules

The coaching layer must keep three voices separate:

- **Kris says**: only claims supported by the Qullamaggie Method Wiki.
- **Your history shows**: claims supported by trades, evaluations, meta reports, or the Personal Trading Wiki.
- **Qrispy infers**: current coaching judgment derived from method plus personal evidence.

This prevents the app from turning your personal adaptations into fake Qullamaggie rules.

## Hosted LLM Provider Strategy

External LLM APIs are the default for the hosted app. Local LLMs can be added later as an advanced/private deployment option, but they do not fit naturally with Vercel-hosted serverless execution.

Requirements:

- store LLM API keys as server-only secrets,
- send only the minimal trade facts and KB excerpts needed,
- record model, prompt version, and context citations,
- make provider configurable.

## Reports

Reports are stored in Postgres `reports.report_markdown` and can optionally be exported to markdown files.

Daily report shape:

```text
# Daily Evaluation - YYYY-MM-DD

## Summary
- trades evaluated
- strongest match
- biggest risk issue
- repeated issue noticed today

## Trades
### SYMBOL direction opened_at
- setup classification
- quantitative score summary
- coaching narrative
- cited wiki files
```

## Periodic Meta-Pattern Pass

Trigger:

- every 25 evaluated trades,
- weekly,
- or manual from the UI.

Inputs:

- latest N narrative evaluations,
- quantitative score table,
- trade outcomes,
- setup classifications,
- account risk/position stats.

Draft prompt:

```text
You are reviewing my last {N} evaluated trades.

Find recurring deviations from Qullamaggie's methodology.

Focus on patterns, not one-off mistakes:
- repeated setup-selection problems
- repeated entry extension/chasing
- repeated oversized risk
- repeated weak market-regime context
- repeated failure to trim or trail
- repeated good deviations that may be part of my own edge

Inputs:
{evaluation_summaries}
{quantitative_table}

Write:
1. Top recurring mistakes, each with trade examples.
2. Which mistakes are most expensive or most frequent.
3. Any context where my deviation was justified.
4. One rule/process change for the next batch.
5. What evidence is missing from the journal.
```

The meta-pattern output can feed the Personal Trading Wiki, but only as a proposed update. The app should show a diff/review step before personal wiki pages become canonical context for future evaluations.

## Guardrails

- LLM calls never write fills or trades.
- Quantitative scores are deterministic and versioned.
- Prompt versions are stored with outputs.
- Missing data reduces confidence instead of creating invented certainty.
- Re-runs create a new version or explicitly supersede old rows.
- Serverless retries must be safe.
