# Knowledge Base

Qrispy should use two separate knowledge layers:

1. **Qullamaggie Method Wiki**: source-backed methodology from Kristjan/Qullamaggie material.
2. **Personal Trading Wiki**: source-backed knowledge about your own trading patterns, mistakes, adaptations, and playbook.

This separation is important. The app must not blur "Kris says" with "your history shows" or "Qrispy infers."

## Core Principle

The LLM may compile and propose wiki updates, but it should not silently mutate canonical knowledge during chat or evaluation.

Preferred workflow:

```text
new raw source / new evaluations
  -> compile job
  -> proposed wiki changes
  -> diff/review
  -> approve
  -> future evaluations and chat can retrieve the updated wiki
```

## Storage Model

Source format remains markdown:

- raw source material,
- generated wiki pages,
- compile instructions,
- source metadata.

Postgres indexes metadata and search fields. Markdown remains the human-readable source format.

Recommended baseline:

- Keep repo-backed markdown for versioning and Obsidian compatibility.
- Deploy compiled wiki files with the app for read access.
- Store user-uploaded raw sources and personal notes in private Supabase Storage.
- Index all source/wiki files in Postgres tables.

## Folder Structure

Preserve the existing imported source folders, but introduce web-app aliases that make the two-layer model explicit.

Current source folders:

```text
1 - Raw Sources/
2 - Wiki/
3 - Schema/
planning/
```

Recommended app-facing structure:

```text
kb/
  method/
    raw/      -> maps to existing `1 - Raw Sources/` where source_type = qullamaggie
    wiki/     -> maps to generated method pages under `2 - Wiki/`
    compile.md
  personal/
    raw/
      trade-notes/
      manual-reflections/
      meta-reports/
    wiki/
      recurring-mistakes.md
      my-playbook.md
      sizing-habits.md
      best-setups.md
      avoid-list.md
    compile.md
```

Implementation can either physically migrate to `kb/` later or keep the existing folders and use config aliases:

- `kb.method.raw_path = "1 - Raw Sources"`
- `kb.method.wiki_path = "2 - Wiki/method"`
- `kb.personal.raw_storage_bucket = "personal-kb-raw"`
- `kb.personal.wiki_storage_bucket = "personal-kb-wiki"`

## Qullamaggie Method Wiki

Purpose:

- setup definitions,
- entries, stops, exits,
- market regime context,
- exceptions and contradictions,
- source-backed thresholds,
- examples from Kristjan's trades and teaching.

Generated structure:

```text
method/
  index.md
  setups/
    episodic-pivot.md
    breakout-flag-wedge.md
    parabolic-short.md
  execution/
    entries.md
    stops.md
    partials-and-trailing.md
    position-sizing.md
  context/
    market-regime.md
    liquidity.md
    catalysts.md
  contradictions/
    liquidity-by-account-size.md
    ep-volume-vs-fundamentals.md
    one-minute-vs-five-minute-orh.md
  source-map/
    sources.md
```

Method wiki rules:

- Every non-obvious claim cites raw source files or source URLs.
- Contradictions are preserved.
- Thresholds are marked with confidence.
- If a rule is qualitative, keep it qualitative.
- Do not use your own trade results to rewrite what Kris says.

## Personal Trading Wiki

Purpose:

- recurring mistakes,
- your adapted rules,
- patterns in your execution,
- emotional/process notes if you choose to store them,
- what works best for you,
- what to avoid,
- personal playbook changes.

Generated structure:

```text
personal/
  index.md
  recurring-mistakes.md
  my-playbook.md
  sizing-habits.md
  entry-habits.md
  exit-habits.md
  best-setups.md
  avoid-list.md
  evidence/
    trade-clusters.md
    meta-report-map.md
```

Personal wiki sources:

- completed narrative evaluations,
- quantitative evaluation metrics,
- meta-pattern reports,
- manual notes,
- screenshots/user annotations,
- explicitly approved reflections.

Personal wiki rules:

- Claims must cite trade ids, report ids, or manual notes.
- It may describe your edge or recurring mistakes, but must not present them as Qullamaggie rules.
- Updates should be proposed by a compile job and approved before becoming canonical.
- Keep "Qrispy suggests" separate from "your history shows."

## Attribution Rules

Every evaluation/chat answer should use these labels:

- **Kris says**: sourced from the Method Wiki.
- **Your history shows**: sourced from trades, evaluations, reports, or Personal Wiki.
- **Qrispy infers**: a coaching interpretation from current context.

Example:

```text
Kris says EPs need a 10%+ gap and exceptional opening volume.
Your history shows your late EP entries have had poor R mechanics in trades #18, #22, and #31.
Qrispy infers the issue is not EP selection; it is paying up after the clean ORH entry has passed.
```

## Compile Instructions

Place method compiler instructions in `3 - Schema/compile-method.md`.

Draft method instruction shape:

```text
You are compiling the Qullamaggie raw source archive into a concise Obsidian-compatible method wiki.

Rules:
- Treat only approved Qullamaggie/Kristjan source material as method source.
- Write generated method notes only under the method wiki path.
- Do not use the user's trade history as evidence for what Kris teaches.
- Do not invent thresholds.
- Preserve contradictions and explain their context.
- Cite raw source files or source metadata for every non-obvious claim.
- End each contradiction page with evaluator guidance.
```

Place personal compiler instructions in `3 - Schema/compile-personal.md`.

Draft personal instruction shape:

```text
You are compiling the user's trading history and approved reflections into a personal trading wiki.

Rules:
- Treat trade evaluations, meta reports, and approved personal notes as source material.
- Write generated personal notes only under the personal wiki path.
- Do not claim Kris teaches something unless it is cited from the Method Wiki.
- Use trade ids/report ids as evidence.
- Separate repeated patterns from one-off events.
- Preserve uncertainty where the sample size is small.
- Produce proposed changes for review before approval.
```

## Web Compile Flow

Method wiki:

1. User uploads or adds a new Qullamaggie transcript/source.
2. File lands in private Supabase Storage or repo-backed raw folder.
3. `kb_sources` row is created with `knowledge_layer = method`.
4. Compile job proposes changes to method wiki pages.
5. User reviews diff.
6. Approved pages become retrievable by evaluator/chat.

Personal wiki:

1. Evaluations and meta reports create structured observations.
2. User may add manual reflections.
3. `personal_compile` job clusters recurring observations.
4. Job proposes changes to personal wiki pages.
5. User reviews and approves.
6. Approved pages become retrievable by evaluator/chat.

## Contradictions

Method contradiction pages handle contradictions in Kristjan's material:

- liquidity cutoff by account size,
- EP volume versus mediocre fundamentals,
- second EPs after prior move,
- 1-minute ORH versus 5-minute/60-minute confirmation,
- 10-day versus 20-day versus 50-day trailing.

Personal contradiction pages handle tension between your observed behavior and the method:

- a non-Kris entry style that works for you,
- trades where breaking a rule improved results,
- setups you should avoid despite looking valid by the method.

## Retrieval

No vector database is required in the first build.

Use:

- explicit setup-to-method-wiki mapping,
- Postgres metadata search,
- text search over wiki markdown,
- trade/report filters for personal evidence,
- optional Postgres full-text search later.

Embeddings can be added later as a derived index, but not as the source of truth.
