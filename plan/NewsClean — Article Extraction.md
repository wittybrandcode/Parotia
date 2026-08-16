# NewsClean — Article Extraction

**Document ID:** `07-ARTICLE-EXTRACTION`
**Version:** `0.1.0`
**Status:** Foundation

## 1. Purpose

The Article Extraction Engine is the read-only intelligence layer that identifies the editorial structure of a webpage. It answers: **Which parts of this webpage represent the actual news story?** It does not scrape or rewrite the article.

The engine is strictly read-only and must never directly modify the DOM.

## 2. Core Principle

> **Extraction observes. Cleanup transforms. Capture renders.**

```
DOM → Extraction → Extraction Result
```

never:

```
DOM → Extraction → DOM Mutation
```

Any subsequent action must pass through the Cleanup Engine and Mutation Engine.

## 3. Problem

A webpage rarely exposes the article as one clean element. Typical structure mixes `HEADER`, `NAV`, `AD`, `MAIN > ARTICLE`, `RELATED`, `SIDEBAR`, `NEWSLETTER`, `FOOTER` — while real sites often use anonymous `div`/`section`/`span` stacks with no meaningful semantic naming. The engine therefore needs a layered strategy rather than reliance on a single HTML tag.

## 4. Extraction Targets

The engine identifies, where possible, 10 fields:

1. Article Container
2. Title
3. Subtitle / Description
4. Hero Image
5. Article Body
6. Author
7. Publication Date
8. Source / Publisher
9. Website Identity
10. Article URL

Not every page contains every field. Missing fields are valid. The engine must never invent editorial information.

## 5. Extraction Modes

- **PASSIVE** — Fast analysis using obvious semantic and metadata signals: `<article>`, `<h1>`, `<main>`, `<meta>`, OpenGraph, Schema.org, JSON-LD.
- **STANDARD** — Normal NewsClean extraction combining DOM structure, metadata, text density, image analysis, and semantic signals.
- **DEEP** — More expensive analysis for difficult websites.

**MVP implements PASSIVE and STANDARD.** DEEP may be added later.

## 6. Extraction Pipeline

The staged pipeline (each stage independently testable):

```
PAGE
 ↓
DOCUMENT ANALYSIS
 ↓
SEMANTIC DISCOVERY
 ↓
METADATA DISCOVERY
 ↓
CONTENT CANDIDATE DETECTION
 ↓
SCORING
 ↓
RELATION ANALYSIS
 ↓
STRUCTURE RESOLUTION
 ↓
VALIDATION
 ↓
EXTRACTION RESULT
```

## 7. Extraction Output

The engine produces an `ExtractionResult`. It describes the page; it does not alter it.

```ts
interface ExtractionResult {
  page: PageIdentity;
  article: ArticleCandidate | null;
  title: ExtractedField<string> | null;
  subtitle: ExtractedField<string> | null;
  heroImage: ExtractedImage | null;
  body: ContentCandidate | null;
  author: ExtractedField<string> | null;
  publicationDate: ExtractedDate | null;
  source: SourceIdentity | null;
  logo: ImageCandidate | null;
  metadata: ExtractionMetadata;
}
```

Example shape:

```json
{
  "article": { "selector": "article.article", "confidence": 0.94 },
  "title": { "selector": "h1", "text": "Article title", "confidence": 0.99 },
  "heroImage": { "selector": ".article-image img", "confidence": 0.88 },
  "body": { "selector": ".article-body", "confidence": 0.92 }
}
```

### 7.1 Page Identity

```ts
interface PageIdentity {
  url: string;
  canonicalUrl: string | null;
  hostname: string;
  title: string | null;
}
```

### 7.2 Article Candidate

```ts
interface ArticleCandidate {
  selector: string;
  elementId: string;
  confidence: number;
  signals: ExtractionSignal[];
}
```

### 7.3 Extracted Field

```ts
interface ExtractedField<T> {
  value: T;
  selector: string | null;
  confidence: number;
  source: ExtractionSource;
}
```

### 7.4 Extraction Source

```ts
type ExtractionSource =
  | "DOM"
  | "SCHEMA"
  | "JSON_LD"
  | "OPEN_GRAPH"
  | "META"
  | "HEURISTIC"
  | "COMBINED";
```

This allows the UI and diagnostics to understand why a field was selected.

### 7.5 Extraction Signals

```json
{ "type": "SEMANTIC_ARTICLE", "weight": 0.30, "matched": true }
```

Signal types: `SEMANTIC_ARTICLE`, `CONTAINS_H1`, `TEXT_DENSITY`, `LOW_LINK_DENSITY`, `SCHEMA_ARTICLE`, `JSON_LD_ARTICLE`, `OPEN_GRAPH_MATCH`, `ARTICLE_CLASS`, `ARTICLE_ID`, `HERO_IMAGE_RELATION`, `ADVERTISEMENT_PENALTY`, `NAVIGATION_PENALTY`. Signals should be inspectable in development mode.

### 7.6 Extraction Metadata

```text
analysisDuration
pageType
engineVersion
candidateCount
warnings
timestamp
```

## 8. Extraction API

```ts
interface ArticleExtractionEngine {
  analyze(options?: ExtractionOptions): Promise<ExtractionResult>;
  getCachedResult(): ExtractionResult | null;
  invalidate(): void;
  isStale(): boolean;
}

interface ExtractionOptions {
  mode?: "PASSIVE" | "STANDARD" | "DEEP";
  useMetadata?: boolean;
  useHeuristics?: boolean;
  includeDiagnostics?: boolean;
}
```

## 9. Article Container Detection

The Article Container is the most important target: the DOM subtree most likely to contain the article.

Container priority chain:

1. `<article>`
2. `<main>`
3. Semantically named containers: `.article`, `.article-content`, `.article-body`, `.story`, `.story-content`, `.post`, `.post-content`, `.news-article`
4. Structural candidates (evaluated by scoring)

### 9.1 Candidate Generation

The engine generates multiple candidates rather than immediately selecting one:

```text
Candidate A  article.article       score 0.91
Candidate B  main.content          score 0.78
Candidate C  div.story-container   score 0.86
```

The highest-scoring valid candidate becomes the primary article candidate.

## 10. Candidate Scoring

Each candidate receives a score:

```text
Article Score =
  Semantic Score
  + Text Density Score
  + Heading Score
  + Paragraph Score
  + Metadata Relationship
  + Image Relationship
  - Navigation Penalty
  - Advertisement Penalty
  - Link Density Penalty
```

Exact numerical weighting is implemented as a configurable scoring model. No single signal should automatically determine the article.

### 10.1 Semantic Score

Priority: `ARTICLE > MAIN > SECTION > DIV`. An `<article>` element receives a stronger initial score than an anonymous `<div>`, but semantic tags are not absolute truth — a site may use `<article>` for unrelated content.

### 10.2 Heading Score

A candidate containing `H1` receives a strong positive signal. `H1 + paragraphs` is stronger than paragraphs alone. The relationship between the H1 and the candidate container matters.

### 10.3 Paragraph Density

News articles contain substantial textual content. Measure:

```text
paragraph count
text length
average paragraph length
text-to-markup ratio
```

40 paragraphs is more likely an article than 2 paragraphs + 30 links.

### 10.4 Link Density

```text
Link Density = linked text / total text
```

A very high link density reduces article confidence, helping distinguish navigation from article body.

### 10.5 Advertisement Penalty

Strong advertising indicators reduce article confidence: `.ad`, `.ads`, `.advert`, `.advertisement`, `.sponsor`, `.promoted`, `.banner`; plus `aria-label`, `role`, known ad dimensions, `iframe`. These contribute to scoring rather than automatically determining classification.

### 10.6 Sidebar Penalty

Common sidebar patterns: `aside`, `.sidebar`, `.right-column`, `.left-column`, `.related`, `.recommendations`. Candidates dominated by these structures receive a lower article score.

### 10.7 Navigation Penalty

Navigation typically contains many links, short labels, menus, buttons, categories. High navigation density strongly reduces article confidence.

## 11. Article Title Detection

The title is generally the highest-value textual element. Detection priority:

1. Schema.org `headline`
2. OpenGraph `og:title`
3. `<h1>`
4. Semantic title classes
5. Largest relevant heading
6. Candidate heading based on the article container

The engine must prefer the title associated with the article rather than a site-wide heading.

### 11.1 H1 Strategy

An `<h1>` is a strong signal but not automatically the title — a page may use `H1 = Website name, H2 = Article title` or multiple H1s. Evaluate:

```text
heading position
text length
article container
semantic metadata
visual prominence
```

### 11.2 Title Validation

A title candidate should: contain meaningful text; be associated with the article container; not look like navigation; not be a cookie/banner message; not be a generic website heading. Reject obvious candidates such as `Home`, `Menu`, `Latest News`, `Subscribe` when they are not article-specific.

### 11.3 Subtitle Detection

Sources: description metadata, article dek, subtitle, lead, standfirst, intro. Classes: `.subtitle`, `.subheadline`, `.dek`, `.standfirst`, `.lead`, `.summary`. Subtitle detection is optional — if confidence is low, the field remains `null`.

## 12. Hero Image Detection

Signals: image inside the article container, large rendered dimensions, early position in the article, OpenGraph image, Schema.org image, `<figure>`, image associated with the title.

### 12.1 Image Ranking

```text
Hero Score =
  Article Association
  + Size
  + Position
  + Metadata
  + Figure Association
  - Icon Penalty
  - Avatar Penalty
  - Advertisement Penalty
```

The largest image is not necessarily the hero image.

### 12.2 Image Exclusions

Reduce scores for: logo, avatar, icon, social icon, advertisement, tracking pixel, decorative background, recommendation thumbnail. Typical dimensions and semantic context help.

### 12.3 Figure & Caption Handling

A hero image may appear inside `<figure><img><figcaption></figure>`. Treat the figure as a potential editorial unit; keep image and caption associated in the result. A caption may be returned as `{ "text": "Caption", "selector": "figcaption", "confidence": 0.91 }`. Captions are editorial content and must not be confused with advertisements.

## 13. Article Body Detection

Focus on text-heavy regions. Strong signals: multiple paragraphs, article container, low link density, text continuity, heading association. Potential selectors: `.article-body`, `.article-content`, `.entry-content`, `.post-content`, `.story-body`.

### 13.1 Container vs Body

These remain separate concepts:

- **Article Container** — may include title, metadata, image, body, share tools.
- **Article Body** — primarily editorial text content.

### 13.2 Paragraph Continuity

The body should represent a continuous editorial sequence. Never merge unrelated blocks (Article + Related Articles + Comments) into one body.

### 13.3 Body Fragments

Sites may split article text (e.g. `<div>Paragraph 1</div><div>Paragraph 2</div><div>Advertisement</div><div>Paragraph 3</div>`). The engine should identify article-like fragments while recognizing interruption zones — but MVP prefers a stable article container over reconstructing text across unrelated DOM branches.

### 13.4 Related / Comments / Social

- Related content (`.related`, `.related-articles`, `.recommended`, `.more-stories`) is classified as likely non-body; this helps Cleanup later.
- Comments (`.comments`, `.comment-section`, `.discussion`) are excluded from body candidates but classified, not automatically deleted.
- Social widgets (share buttons, embedded posts, social feeds) are auxiliary content; the engine must not modify them.

## 14. Author, Date, Source & Identity

### 14.1 Author

Sources: Schema.org author, `<meta>`, author classes, `rel="author"`, byline. Selectors: `.author`, `.byline`, `.article-author`, `.post-author`. Returns:

```json
{ "text": "Author Name", "selector": ".author", "confidence": 0.89 }
```

### 14.2 Publication Date

Sources: `<time>`, `datetime` attribute, Schema.org `datePublished`, metadata, article date classes. Prefer a semantic machine-readable date when available. Preserve both raw text and normalized date where normalization is reliable:

```json
{ "raw": "12 August 2026", "normalized": "2026-08-12" }
```

If the date is ambiguous: `normalized = null`. **The engine must never guess.**

### 14.3 Source / Publisher

Sources: site name, organization metadata, Schema.org publisher, OpenGraph `site_name`, header branding, domain.

```json
{ "name": "Example News", "domain": "example.com", "confidence": 0.97 }
```

### 14.4 Website Identity & Logo

Website identity is distinct from article source metadata: logo, brand name, header, site name. Signals: `<header>`, `<img alt="logo">`, SVG, `.brand`, `.logo`, `.site-logo`. Rank `semantic identity + header location + small visual footprint`. A large article image must not be mistaken for a logo.

### 14.5 URL Detection

The current page URL is authoritative. Record the page URL; expose `<link rel="canonical">` as `canonicalUrl` when present. The URL is never rewritten. Distinguish Page URL / Canonical URL / Article ID (a structured identifier may be recorded as metadata when present); never invent an article ID.

## 15. Metadata Sources

Precedence:

```
DOM Semantics
 ↓
Schema.org
 ↓
OpenGraph
 ↓
Other Metadata
 ↓
Visual / Structural Heuristics
```

Metadata should corroborate DOM findings rather than blindly override them.

### 15.1 OpenGraph

`og:title`, `og:description`, `og:image`, `og:site_name` are strong signals for title, description, hero image, and source — but validate them against the current page.

### 15.2 Schema.org

Inspect `Article`, `NewsArticle`, `headline`, `description`, `image`, `author`, `datePublished`, `dateModified`, `publisher`.

### 15.3 JSON-LD

Parse `<script type="application/ld+json">` only when it is valid JSON. Invalid JSON-LD must not break extraction — ignore malformed structured data and continue with other signals.

### 15.4 Multiple Structured Objects

Pages may contain Organization, BreadcrumbList, WebSite, NewsArticle. Prefer `NewsArticle`, `Article`, `BlogPosting` before generic `WebSite`, `Organization`.

### 15.5 Conflict Resolution

Do not silently assume one source is always correct; score the candidates:

```text
DOM H1:     Title A
og:title:   Title B
JSON-LD:    Title A

Title A:  DOM +0.5, JSON-LD +0.3, Context +0.2
Title B:  OpenGraph +0.4, Context +0.1
```

The highest-confidence result becomes primary.

## 16. Confidence

Every extracted field carries a confidence value. Confidence is not a probability that the value is mathematically correct — it is an internal ranking score.

```text
0.90 – 1.00 → HIGH
0.70 – 0.89 → MEDIUM
< 0.70      → LOW
```

Exact thresholds are configurable.

### 16.1 No-Guessing Principle

If no candidate reaches an acceptable threshold: `value = null`. The engine must prefer `UNKNOWN` over `WRONG` — especially for title, author, date, and hero image.

## 17. Page Typing

Some pages contain multiple article-like regions (homepage, search results, news feed, category page). The engine must determine whether the page is a Single Article or Article Listing.

- **Single article**: one dominant title, one dominant body, one primary image, article metadata, article structured data.
- **Listing page**: many titles, many images, short excerpts, repeated article cards → `pageType = ARTICLE_LIST` rather than misidentifying one card as the main article.

```ts
type PageType =
  | "ARTICLE"
  | "ARTICLE_LIST"
  | "CATEGORY"
  | "SEARCH"
  | "HOME"
  | "UNKNOWN";
```

MVP supports only `ARTICLE` and `UNKNOWN`; expand later.

## 18. Warnings, Diagnostics & Explainability

Warnings (must not block operation): multiple H1 elements detected; article container confidence is medium; hero image could not be determined; structured data is malformed; page contains multiple article candidates.

Development mode may expose: candidate, score, signals, rejected candidates, selected candidate, metadata sources — critical during testing against real news websites.

**Explainability**: for advanced users the system should explain selection, e.g. "Article container selected because it contains the primary H1, 27 paragraphs, low link density, and matching NewsArticle metadata." Especially valuable when extraction confidence is imperfect.

## 19. Integrations

### 19.1 Cleanup

Extraction never deletes anything; its result is consumed by Cleanup:

```
Extraction → article = .article → Keep Mode → Cleanup Proposal → Mutation
```

### 19.2 Keep Mode

The article selector is the default protected region. High confidence → fast "Keep Article" workflow; low confidence → manual selection required.

### 19.3 Smart Cleanup

```
Article detected → Protect article → Analyze outside article
→ Find likely noise → Generate cleanup proposal
```

One of the most important integrations in NewsClean.

### 19.4 Composition

Uses `source`, `logo`, `title`, `hero image`, `body`, `date`, `author` to construct an editorial layout. The extraction result is the semantic input to Composition.

### 19.5 Capture

"Capture Article" requests the article selector; the Extraction Engine returns it, the Capture Engine decides how to render it.

### 19.6 Presets

Future presets may contain extraction hints `{ article, title, heroImage, body }` to accelerate extraction on known websites. Hints must be validated against the current DOM — a strong signal, not unconditional truth:

```
Validated Preset Hint → Current DOM Validation → Extraction
```

### 19.7 News Mode

Extraction is the first intelligence layer of News Mode: `Freeze → Extract → Identify Article → Identify Noise → Propose Cleanup → Review → Clean → Capture` — the foundation of one-click editorial capture.

### 19.8 Timing

Extraction normally occurs after Freeze: `Page → Freeze → Extraction → Inspector/Cleanup`. This prevents the extraction result from becoming stale immediately.

### 19.9 Re-Extraction

The DOM can change after extraction. `Re-analyze` generates a new `ExtractionResult` and must not silently change active cleanup rules.

## 20. Caching & Invalidation

Extraction results may be cached during a stable session.

- Cache key: `sessionId`.
- Invalidated when significant DOM mutations occur.
- Mark `Extraction = STALE` rather than automatically recomputing after every cleanup operation.

Extraction becomes stale after: article container removed, major DOM mutation, page navigation, reload, large layout change. Small cosmetic cleanup operations need not invalidate the result.

**Incremental extraction** (partial re-analysis, e.g. recalculate hero image only) is future work, not required for MVP.

## 21. Performance

Targets (engineering targets, not user-visible guarantees):

```text
Passive extraction:  < 50 ms
Standard extraction: < 250 ms
Deep extraction:     no strict MVP target
```

The engine must not block the UI: avoid repeated complete DOM traversal, analyze only necessary subtrees, cache metadata, defer expensive analysis, run deep analysis only when required.

**Large DOM strategy**: prioritize likely regions (`MAIN`, `ARTICLE`, sections containing H1, semantic content containers) before scanning every anonymous `<div>`.

### 21.1 Memory

Never store the entire DOM. Retain selectors, references, scores, metadata, extracted values, diagnostics. Large article text should not be duplicated unnecessarily.

### 21.2 Text Extraction

Normalize carefully: whitespace normalization, line-break normalization, invisible text removal, repeated whitespace reduction. Preserve the actual page text semantically; never rewrite or summarize it.

### 21.3 Hidden Content

Distinguish visible vs hidden content (`display:none`, `visibility:hidden`, `opacity:0`, offscreen). Hidden text generally receives lower extraction priority; metadata hidden from visual rendering may still be useful for structured extraction.

### 21.4 Accessibility & Semantic Signals

`role="article"`, `aria-label`, `aria-labelledby` supplement (not replace) DOM and visual signals. Recognize `main`, `article`, `header`, `section`, `aside`, `figure`, `figcaption`, `time`, `address`, `nav`.

## 22. Security & Local-First

The page is untrusted. Treat JSON-LD, meta content, attributes, text, URLs, and class names as untrusted data. Structured metadata parsing must be safe; no extracted value may be interpreted as executable code.

The MVP operates only on the currently loaded page. It must not crawl the website, download other pages, query search engines, or send content to external services — preserving the Local-First principle.

## 23. Failure & Manual Override

If extraction fails: `ExtractionResult.article = null`. Manual Inspector, Manual Cleanup, and Manual Capture remain available — extraction failure must never disable the core product.

The user may override extraction. Once the user manually selects an article container, that selection becomes authoritative for the current session. Future versions may allow "Set as Title / Set as Hero Image / Set as Body / Set as Source", converting the inspector into a semantic labeling tool.

## 24. Strategy Priority

Overall strategy:

```text
1. Structured Metadata
2. Semantic HTML
3. DOM Relationships
4. Content Density
5. Visual Geometry
6. Naming Heuristics
7. Combined Scoring
```

No single mechanism is authoritative in all cases.

## 25. Future Extensions

Advanced semantic extraction, readability-style content scoring, language detection, multilingual article heuristics, automatic caption extraction, video poster detection, article chronology detection, paywall detection, embedded media classification, AI / local-LLM extraction, website-specific extraction profiles, shared newsroom extraction rules. These extend the existing `ExtractionResult` contract.

**AI Integration Boundary**: future AI plugs in through an Analyzer interface. Heuristic and AI analyzers both produce `ExtractionResult`; the rest of the system does not care how the result was produced.

## 26. Contract & Architectural Invariants

The following rules are mandatory:

1. Extraction is read-only.
2. Extraction never directly mutates the DOM.
3. Extraction never deletes content.
4. Extraction never rewrites article text.
5. No external network dependency for core extraction.
6. Deterministic output for the same stable DOM and configuration.
7. Extraction produces explicit confidence.
8. Extraction prefers UNKNOWN over an unreliable guess.
9. Semantic HTML is a signal, not absolute truth.
10. Metadata is a signal, not absolute truth.
11. Multiple candidates are scored when ambiguity exists.
12. Article container and article body are distinct concepts.
13. Hero image detection considers semantic context.
14. Source identity is preserved.
15. Structured metadata is parsed safely.
16. Extraction operates locally in the MVP.
17. Extraction results are session-scoped.
18. Stale extraction results are detectable.
19. Manual user selection overrides automatic extraction.
20. Cleanup owns mutation; Capture owns rendering.
21. Future AI plugs into the extraction boundary rather than bypassing it.

## 27. Acceptance Criteria

The Article Extraction Engine is MVP-complete when it can:

1. Analyze a frozen article page.
2. Identify the primary article container when detectable.
3. Identify the primary title.
4. Identify a likely hero image.
5. Identify the article body.
6. Identify author when available.
7. Identify publication date when available.
8. Identify publisher/source when available.
9. Read relevant OpenGraph metadata.
10. Read relevant JSON-LD / Schema.org data.
11. Produce confidence values.
12. Produce null instead of guessing when confidence is insufficient.
13. Detect basic article-vs-non-article pages.
14. Remain read-only.
15. Work without a backend.
16. Fail gracefully when extraction is ambiguous.
17. Allow manual override through the Inspector.
18. Provide selectors usable by Cleanup and Capture.
