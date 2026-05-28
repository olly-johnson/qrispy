# Qullamaggie Rules

These are planning defaults for the deterministic quantitative layer. They are not pass/fail rules. Each metric should produce a 0-1 score and feed the coaching layer, which decides whether a deviation mattered in context.

Confidence levels:

- High: explicit local source gives a number or formula.
- Medium: explicit qualitative source, but numeric scoring threshold is our proposed operationalization.
- Low: useful default inferred from the method, needs more transcripts/examples.

## Source Index

- Q3S: `../1 - Raw Sources/Site/3 TIMELESS setups that have made me TENS OF MILLIONS!.md`; source URL in frontmatter: <https://qullamaggie.com/my-3-timeless-setups-that-have-made-me-tens-of-millions/>
- EP: `../1 - Raw Sources/Site/How to master a setup Episodic Pivots.md`; source URL in frontmatter: <https://qullamaggie.com/how-to-master-a-setup-episodic-pivots/>
- FAQ: `../1 - Raw Sources/Site/Frequently Asked Questions.md`; source URL in frontmatter: <https://qullamaggie.com/faq/>
- CWT: `../1 - Raw Sources/Podcast/Transcript - Chat with traders.md`
- SR-2023-05-19: `../1 - Raw Sources/Stream Recaps/Qullamaggie Stream Notes 19 May 2023.md`
- SR-2023-05-23: `../1 - Raw Sources/Stream Recaps/Qullamaggie Stream Notes 23 May 2023.md`
- SR-History: `../1 - Raw Sources/Stream Recaps/Studying History, Adaptability and Role Models.md`

## Global Risk And Position Sizing

| Rule | Default scoring | Confidence | Sources | Notes |
| --- | --- | --- | --- | --- |
| Risk per trade usually 0.25-1%; most often 0.3-0.5%; rarely over 1%. | 1.0 at 0.25-0.75%, 0.8 at 0.75-1.0%, linearly down to 0 at 2.0%+. | High | Q3S, FAQ | FAQ says depends on liquidity and conviction. Smaller accounts may intentionally risk more, but coaching should flag this as context-dependent. |
| Position size usually 5-25%, often 10-20% or 10-15%. | 1.0 at 5-20%, 0.8 at 20-25%, down to 0 above 40%; separate overnight exposure warning above 30%. | High | Q3S, FAQ | Intraday size can be larger because overnight gap risk is absent. |
| Avoid more than 30% account overnight in one stock/ETF. | 1.0 <= 25%, 0.7 at 25-30%, 0 below 40%. | High | Q3S | Coaching can allow exceptions for exceptional liquidity/conviction but should be skeptical. |
| Use stops; market stops preferred when close to stop. | Score based on whether an initial stop exists and whether actual exit respected it. | High | FAQ | FAQ says hard and mental stops both used; overriding is "very rarely" and not for inexperienced traders. |

## ADR And Liquidity

| Rule | Default scoring | Confidence | Sources | Notes |
| --- | --- | --- | --- | --- |
| ADR formula is 20-session average of `H/L`, minus 1, expressed as %. | Implement exact formula. | High | FAQ | This is a formula, not a threshold. |
| Liquidity cutoff depends on account size; Qullamaggie used about $150M dollar volume at larger size and about $20M earlier. | 1.0 above $150M, 0.7 above $20M, 0.3 below $20M, but scale by user's account size. | Medium | CWT | Contradiction/context: lower liquidity can be a small-account edge, but unsuitable for large size. |
| EP volume should be massive near the open; ideal is average daily volume in first 15-20 minutes or quicker. | 1.0 if first 20 min volume >= 100% ADV, 0.8 if >= 50%, 0.5 if big relative volume appears by 30 min, 0.2 if normal volume. | High for rule, Medium for scoring | EP, Q3S | Q3S says many best EPs trade ADV in first 15-30 min. |
| Volume can outweigh mediocre fundamentals in EPs. | No deterministic score; use as coaching nuance when volume score is high and catalyst quality is mixed. | Medium | SR-2023-05-23 | Source recap says "volume always trumps numbers"; should be used carefully. |

## Breakout / Flag / Wedge

| Rule | Default scoring | Confidence | Sources | Notes |
| --- | --- | --- | --- | --- |
| Prior move: leading stock up strongly over 1/3/6 months; often 30-100%+ in 1-3 months. | 1.0 if prior 1-3 month move >= 30%, 0.7 at 20-30%, 0.3 below 10%. | High | Q3S, CWT | Scan universe should focus strongest 1-2% of stocks. |
| Consolidation duration usually 2 weeks to 2 months. | 1.0 for 10-45 trading days, 0.7 for 5-10 or 45-65, lower outside. | High | Q3S | Needs pattern detection tuning. |
| Consolidation should be orderly with higher lows and tightening range. | Score using lower-high/higher-low compression, slope stability, and declining range/ATR. | Medium | Q3S, CWT | CWT calls this "linearity"; hard to quantify perfectly. |
| Stock should surf rising 10/20-day moving averages, sometimes 50-day. | 1.0 if consolidation holds above rising 10/20 EMA/SMA, 0.7 if near 20, lower if repeatedly loses 50. | Medium | Q3S, CWT | Need decide EMA vs SMA in implementation settings. |
| Entry should be on ORH or daily breakout, not random anticipation unless experienced. | 1.0 if entry within small band above 1m/5m/60m ORH or pivot; lower as entry drifts. | High for concept, Medium for band | Q3S, CWT | Anticipation is allowed but less effective and requires skill. |
| Stop should be low of day/opening range and not wider than ATR or ADR. | 1.0 if risk <= 1.0x ATR/ADR, 0.7 <= 1.5x, 0 below 2x. | High | Q3S, EP | EP explicitly allows max 1.5x; breakout page says not wider than ATR/ADR. |
| Take partials after 3-5 days or into the initial momentum burst, then move stop to breakeven. | 1.0 if 1/3-1/2 sold around day 3-5 after strong move; 0.7 if partial earlier/later with rationale; 0.2 if no partial after large fast move. | High for rule, Medium for scoring | Q3S, CWT, SR-2023-05-19 | User asked for 3-5R window; sources found say 3-5 days more explicitly than 3-5R. Mark 3-5R as provisional until transcripts confirm. |
| Trail remainder with 10/20-day moving average, beginner default 10-day. | 1.0 if remainder exits on close below selected MA; partial credit for sensible manual trail. | High | Q3S, CWT, SR-2023-05-19 | Q3S says wait for first close below 10-day for beginner. |
| Breakouts work best in small/mid caps and uptrending markets. | Market-context modifier, not per-trade score. | Medium | SR-2023-05-23 | Range-bound markets may make EPs better than breakouts. |

## Episodic Pivot

| Rule | Default scoring | Confidence | Sources | Notes |
| --- | --- | --- | --- | --- |
| EP gap should be 10%+. | 1.0 >= 10%, 0.7 at 7-10%, 0.3 below 5% unless special context. | High | EP, Q3S | Explicit. |
| Catalyst should force revaluation: earnings/guidance, FDA/biotech, political/regulatory, contracts, sector EP. | LLM classification field; deterministic score only checks catalyst presence if available. | High | EP, Q3S | News source integration may be later milestone. |
| Best EPs often come after 3-6 months sideways or more. | 1.0 if prior 3-6 months range-bound, 0.5 if already extended, but allow second EP nuance. | High | EP, Q3S | Contradiction/context: second EPs can work, but failure rate may be higher. |
| Earnings EP should show strong growth, preferably mid/high double-digit or triple-digit EPS/revenue growth, beat, and guidance raise. | Provisional catalyst-quality score; absent fundamentals should not block evaluation. | Medium | EP, Q3S | Source says many small stocks lack analyst coverage; volume is primary. |
| Entry ORH: 1-minute, 5-minute, or 60-minute highs. | 1.0 if entry near selected ORH; 0.7 if later add through day while acting well; lower if chasing far above ORH. | High | EP, Q3S | EP source explicitly says no need to be first. |
| Stop at low of day; risk no more than 1x, max 1.5x ADR/ATR. | 1.0 <= 1x, 0.7 <= 1.5x, 0 below 2x. | High | EP | Strong source. |

## Parabolic Short / Long

| Rule | Default scoring | Confidence | Sources | Notes |
| --- | --- | --- | --- | --- |
| Parabolic short candidate: larger cap up 50-100%+ in days/weeks; smaller cap up 300-1000%+. | 1.0 if threshold met for cap bucket; 0.5 if only partially extended. | High | Q3S | Need market cap/free float support later. |
| Up 3-5+ days in a row or accelerating after longer trend. | 1.0 >= 3 consecutive up days plus acceleration; lower if choppy. | High | Q3S | |
| Entry on ORL, first red 5-min candle, first crack and VWAP fail. | Score entry proximity to ORL/VWAP fail. | High | Q3S | |
| Stop is high of day or VWAP reclaim. | Score based on defined stop and adherence. | High | Q3S | |
| Target area is 10/20-day moving averages; expected reward often 5-10R, not 30-50R. | Use setup-specific expected hold/target scoring. | High | Q3S | |

## Known Contradictions And Nuance Flags

- Liquidity: Qullamaggie used a $150M dollar-volume cutoff at large account size but previously used about $20M. Small illiquid names can be a small-account edge, but slippage and sizing change the rule.
- EP fundamentals versus volume: strong earnings/guidance are ideal, but source notes say volume can trump numbers.
- EP after prior move: best EPs come after sideways action, yet second EPs can still work. Coach should distinguish "lower odds" from "invalid."
- Entries: 1-minute ORH offers earlier entry but higher failure rate than 5-minute/60-minute confirmation. Paying up on a clean high-volume EP can be acceptable.
- Partials: sources strongly support 3-5 days and trimming explosive moves; the user-requested 3-5R window should remain provisional until more transcripts confirm.
- Moving averages: sources often say 10/20-day moving average without specifying EMA vs SMA. Implementation should record the chosen type.
