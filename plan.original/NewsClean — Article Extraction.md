# NewsClean
## Article Extraction

**Document ID:** 07-ARTICLE-EXTRACTION  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`

---

## 1. Purpose

The Article Extraction Engine is the read-only intelligence layer responsible for identifying the editorial structure of a webpage.

Its purpose is not to scrape or rewrite the article.

Its purpose is to answer:

> **Which parts of this webpage represent the actual news story?**

The engine analyzes the current DOM and produces a structured representation of the article.

Conceptually:

```text id="n4x8p2"
WEB PAGE
   ↓
ARTICLE EXTRACTION ENGINE
   ↓
EDITORIAL STRUCTURE
```

Example:

```text id="r7m2q5"
Article
├── Source
├── Logo
├── Title
├── Subtitle
├── Hero Image
├── Author
├── Publication Date
└── Body
```

The engine is strictly read-only.

It must never directly modify the DOM.

---

# 2. Core Principle

The fundamental rule is:

> **Extraction observes. Cleanup transforms. Capture renders.**

Therefore:

```text id="v8q3m1"
DOM
 ↓
Extraction
 ↓
Extraction Result
```

not:

```text id="p5m7x2"
DOM
 ↓
Extraction
 ↓
DOM Mutation
```

Any subsequent action must pass through the Cleanup Engine and Mutation Engine.

---

# 3. Problem

A webpage rarely exposes the article as one clean element.

A typical structure may look like:

```text id="k3m8q5"
BODY
├── HEADER
├── NAV
├── AD
├── MAIN
│   ├── ARTICLE
│   │   ├── H1
│   │   ├── META
│   │   ├── IMAGE
│   │   └── BODY
│   ├── RELATED
│   └── SIDEBAR
├── NEWSLETTER
└── FOOTER
```

However, real websites may use:

```text id="x7m2p4"
div
div
div
section
div
span
```

without meaningful semantic naming.

The Extraction Engine therefore needs a layered strategy rather than relying on a single HTML tag.

---

# 4. Extraction Objective

The engine should identify, where possible:

```text id="m4x8q2"
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
```

Not every page will contain every field.

Missing fields are valid.

The engine must never invent editorial information.

---

# 5. Extraction Output

The engine produces an `ExtractionResult`.

Conceptually:

```json id="c8m3q7"
{
  "article": {
    "selector": "article.article",
    "confidence": 0.94
  },
  "title": {
    "selector": "h1",
    "text": "Article title",
    "confidence": 0.99
  },
  "heroImage": {
    "selector": ".article-image img",
    "confidence": 0.88
  },
  "body": {
    "selector": ".article-body",
    "confidence": 0.92
  }
}
```

The result describes the page.

It does not alter it.

---

# 6. Extraction Pipeline

The engine uses a staged pipeline:

```text id="q6m8x3"
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

Each stage should be independently testable.

---

# 7. Extraction Modes

The engine supports three conceptual modes.

```text id="v2m7q9"
PASSIVE
STANDARD
DEEP
```

### PASSIVE

Fast analysis using obvious semantic and metadata signals.

### STANDARD

Normal NewsClean extraction.

Uses DOM structure, metadata, text density, image analysis, and semantic signals.

### DEEP

More expensive analysis intended for difficult websites.

The MVP should implement PASSIVE and STANDARD.

DEEP may be added later.

---

# 8. Passive Extraction

Passive extraction should be extremely fast.

It looks for:

```text id="x4m8q2"
<article>
<h1>
<main>
<meta>
OpenGraph
Schema.org
JSON-LD
```

The objective is to obtain obvious information without scanning the entire DOM aggressively.

---

# 9. Standard Extraction

Standard extraction combines multiple signals.

Potential signals:

```text id="m7q3x8"
Semantic HTML
Heading hierarchy
Text density
Paragraph density
Link density
Image placement
DOM depth
Metadata
Schema.org
OpenGraph
Article-specific classes
Article-specific IDs
Content length
Sibling relationships
```

No single signal should automatically determine the article.

---

# 10. Article Container Detection

The Article Container is the most important extraction target.

The engine should identify the DOM subtree that most likely contains the actual article.

Preferred candidates:

```text id="q5m8x3"
<article>
```

then:

```text id="r7x2m4"
<main>
```

then semantically named containers:

```text id="v8m3q5"
.article
.article-content
.article-body
.story
.story-content
.post
.post-content
.news-article
```

Finally, structural candidates may be evaluated.

---

# 11. Article Candidate Generation

The engine should generate multiple candidates rather than immediately selecting one.

Example:

```text id="p4m8x2"
Candidate A
article.article
score 0.91

Candidate B
main.content
score 0.78

Candidate C
div.story-container
score 0.86
```

The highest-scoring valid candidate becomes the primary article candidate.

---

# 12. Candidate Scoring

Each candidate receives a score.

Conceptually:

```text id="x7m3q8"
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

The exact numerical weighting should be implemented as a configurable scoring model.

---

# 13. Semantic Score

Semantic HTML is a strong signal.

Example priority:

```text id="m8q2v4"
ARTICLE
MAIN
SECTION
DIV
```

An `<article>` element should generally receive a stronger initial score than an anonymous `<div>`.

However, semantic tags must not be treated as absolute truth.

A website may use `<article>` for unrelated content.

---

# 14. Heading Score

An article candidate containing:

```text id="q4m7x2"
H1
```

should receive a strong positive signal.

A candidate containing:

```text id="z8m3p5"
H1 + paragraphs
```

is stronger than a candidate containing only paragraphs.

The relationship between the H1 and the candidate container is important.

---

# 15. Paragraph Density

News articles typically contain substantial textual content.

The engine should measure:

```text id="f3m8q2"
paragraph count
text length
average paragraph length
text-to-markup ratio
```

A candidate with:

```text id="v5m2x8"
40 paragraphs
```

is more likely to be an article than:

```text id="n7q3m4"
2 paragraphs + 30 links
```

---

# 16. Link Density

Navigation and recommendation areas tend to have high link density.

For each candidate:

```text id="k8m4x2"
Link Density =
linked text / total text
```

A very high link density should reduce article confidence.

This helps distinguish:

```text id="s7m3q8"
Navigation
```

from:

```text id="q4x8m2"
Article Body
```

---

# 17. Advertisement Penalty

Elements containing strong advertising indicators should reduce article confidence.

Potential indicators:

```text id="p3m8x7"
.ad
.ads
.advert
.advertisement
.sponsor
.promoted
.banner
```

Other signals may include:

```text id="x6q2m4"
aria-label
role
known ad dimensions
iframe
```

These indicators should contribute to scoring rather than automatically determine classification.

---

# 18. Sidebar Penalty

Common sidebar patterns include:

```text id="m5x8q3"
aside
.sidebar
.right-column
.left-column
.related
.recommendations
```

Candidates dominated by these structures should receive a lower article score.

---

# 19. Navigation Penalty

Navigation typically contains:

```text id="q8m2x4"
many links
short labels
menus
buttons
categories
```

A high navigation density should strongly reduce article confidence.

---

# 20. Article Title Detection

The title is generally the highest-value textual element.

Detection priority:

```text id="v3m8q2"
1. Schema.org headline
2. OpenGraph og:title
3. <h1>
4. Semantic title classes
5. Largest relevant heading
6. Candidate heading based on article container
```

The engine must prefer the title associated with the article rather than a site-wide heading.

---

# 21. H1 Strategy

An `<h1>` is a strong signal but not automatically the article title.

A page may contain:

```text id="x5m7q3"
H1 = Website name
H2 = Article title
```

or multiple H1 elements.

Therefore the engine must evaluate:

```text id="r8m2q5"
heading position
text length
article container
semantic metadata
visual prominence
```

---

# 22. Title Validation

A title candidate should generally:

- Contain meaningful text.
- Be associated with the article container.
- Not look like navigation.
- Not be a cookie/banner message.
- Not be a generic website heading.

The engine should reject obvious candidates such as:

```text id="q7m3x8"
Home
Menu
Latest News
Subscribe
```

when they are not article-specific.

---

# 23. Subtitle Detection

Possible sources:

```text id="m4x8q2"
description metadata
article dek
subtitle
lead
standfirst
intro
```

Potential classes:

```text id="v7m2p5"
.subtitle
.subheadline
.dek
.standfirst
.lead
.summary
```

Subtitle detection is optional.

If confidence is low, the field remains null.

---

# 24. Hero Image Detection

The engine should identify the most likely primary article image.

Signals include:

```text id="x8m3q4"
Image inside article container
Large rendered dimensions
Early position in article
OpenGraph image
Schema.org image
Figure element
Image associated with title
```

---

# 25. Image Ranking

Images should be ranked.

Conceptually:

```text id="q3m8v2"
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

---

# 26. Image Exclusions

The engine should reduce scores for:

```text id="m7x4q8"
Logo
Avatar
Icon
Social icon
Advertisement
Tracking pixel
Decorative background
Recommendation thumbnail
```

Typical dimensions and semantic context can help.

---

# 27. Article Body Detection

Article body detection should focus on text-heavy regions.

Strong signals:

```text id="p8m3x6"
multiple paragraphs
article container
low link density
text continuity
heading association
```

Potential selectors:

```text id="x5q8m2"
.article-body
.article-content
.entry-content
.post-content
.story-body
```

---

# 28. Paragraph Continuity

The body should ideally represent a continuous editorial sequence.

The engine should avoid combining unrelated blocks such as:

```text id="r4m7x3"
Article
+
Related Articles
+
Comments
```

into one body.

The article body should remain structurally coherent.

---

# 29. Body Fragment Detection

Some websites split article text:

```text id="v3m8q5"
<div>Paragraph 1</div>
<div>Paragraph 2</div>
<div>Advertisement</div>
<div>Paragraph 3</div>
```

The engine should be capable of identifying article-like fragments while recognizing interruption zones.

However, the MVP should prefer a stable article container rather than reconstructing arbitrary text across unrelated DOM branches.

---

# 30. Author Detection

Potential sources:

```text id="q8m2v4"
Schema.org author
<meta>
author classes
rel="author"
byline
```

Potential selectors:

```text id="m7x3q8"
.author
.byline
.article-author
.post-author
```

The engine should return:

```json id="x5m8q2"
{
  "text": "Author Name",
  "selector": ".author",
  "confidence": 0.89
}
```

---

# 31. Publication Date Detection

Potential sources:

```text id="r4m7x2"
time element
datetime attribute
Schema.org datePublished
metadata
article date classes
```

Preferred source:

```text id="v8m3q5"
Semantic machine-readable date
```

when available.

The engine should preserve both:

```text id="q3m8x7"
raw text
normalized date
```

where normalization is reliable.

---

# 32. Date Normalization

If a page contains:

```text id="m4x8q2"
12 August 2026
```

the engine may produce:

```json id="x7m3q5"
{
  "raw": "12 August 2026",
  "normalized": "2026-08-12"
}
```

If the date is ambiguous:

```text id="q8m2v4"
normalized = null
```

The engine must never guess.

---

# 33. Source / Publisher Detection

The source can be identified through:

```text id="v5m8x2"
Site name
Organization metadata
Schema.org publisher
OpenGraph site_name
Header branding
Domain
```

Example:

```json id="r3m7q8"
{
  "name": "Example News",
  "domain": "example.com",
  "confidence": 0.97
}
```

---

# 34. Website Identity

Website identity is distinct from article source metadata.

The engine may identify:

```text id="m8x3q2"
Logo
Brand name
Header
Site name
```

The logo may be useful for Composition Mode.

The engine should identify the most likely logo candidate without automatically modifying the page.

---

# 35. Logo Detection

Possible signals:

```text id="q7m4x8"
<header>
<img alt="logo">
SVG
.brand
.logo
.site-logo
```

The engine should rank:

```text id="v3m8q2"
semantic identity
+
header location
+
small visual footprint
```

A large article image must not be mistaken for a logo.

---

# 36. URL Detection

The current page URL is authoritative for the article page.

The engine should record:

```text id="x5m8q3"
page URL
```

It may also inspect canonical URL metadata.

If a canonical URL exists:

```text id="m7q2v8"
<link rel="canonical">
```

the engine may expose it as:

```text id="r4x8m3"
canonicalUrl
```

The URL should not be rewritten.

---

# 37. Metadata Sources

The Extraction Engine should consider several metadata layers.

Priority generally follows:

```text id="q8m3x5"
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

---

# 38. OpenGraph

Relevant metadata may include:

```text id="v5m2q8"
og:title
og:description
og:image
og:site_name
```

These are strong signals for:

```text id="m3x7q2"
Title
Description
Hero Image
Source
```

but the engine should still validate them against the current page.

---

# 39. Schema.org

Schema.org structured data can provide strong editorial signals.

Potential properties:

```text id="q4m8x3"
Article
NewsArticle
headline
description
image
author
datePublished
dateModified
publisher
```

The engine should inspect structured data when available.

---

# 40. JSON-LD

Many websites expose structured data through:

```html id="r7m3x8"
<script type="application/ld+json">
```

The engine may parse JSON-LD when it is valid JSON.

Invalid JSON-LD must not break extraction.

The engine should ignore malformed structured data and continue with other signals.

---

# 41. Multiple Structured Objects

A page may contain multiple JSON-LD objects:

```text id="m8q2v5"
Organization
BreadcrumbList
WebSite
NewsArticle
```

The engine should identify the object most relevant to the current page.

Preference:

```text id="x4m7q2"
NewsArticle
Article
BlogPosting
```

before generic:

```text id="v8m3q5"
WebSite
Organization
```

---

# 42. Metadata Conflict Resolution

Example:

```text id="q3m8x7"
DOM H1:
Title A

og:title:
Title B

JSON-LD headline:
Title A
```

The engine should not silently assume that one source is always correct.

Instead it should score the candidates.

Example:

```text id="m7x4q2"
Title A
DOM: +0.5
JSON-LD: +0.3
Context: +0.2

Title B
OpenGraph: +0.4
Context: +0.1
```

The highest-confidence result becomes primary.

---

# 43. Extraction Confidence

Every extracted field should have a confidence value.

Example:

```json id="x5m8q3"
{
  "value": "Article title",
  "confidence": 0.96
}
```

Confidence is not a probability that the value is mathematically correct.

It is an internal ranking score.

---

# 44. Confidence Levels

The UI may translate scores into:

```text id="q8m3v5"
HIGH
MEDIUM
LOW
```

For example:

```text id="m4x7q2"
0.90 – 1.00 → HIGH
0.70 – 0.89 → MEDIUM
< 0.70 → LOW
```

Exact thresholds should be configurable.

---

# 45. No Guessing Principle

If no candidate reaches an acceptable threshold:

```text id="v7m2x4"
value = null
```

The engine must prefer:

```text id="q3m8x7"
UNKNOWN
```

over:

```text id="m8x2v5"
WRONG
```

This is especially important for title, author, date, and hero image extraction.

---

# 46. Extraction Result Schema

Recommended structure:

```ts id="x7m3q8"
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

---

# 47. Page Identity

Conceptual:

```ts id="q4m8x2"
interface PageIdentity {
  url: string;
  canonicalUrl: string | null;
  hostname: string;
  title: string | null;
}
```

---

# 48. Article Candidate

Conceptual:

```ts id="m7x3q5"
interface ArticleCandidate {
  selector: string;
  elementId: string;
  confidence: number;
  signals: ExtractionSignal[];
}
```

---

# 49. Extracted Field

Conceptual:

```ts id="v8m2q4"
interface ExtractedField<T> {
  value: T;
  selector: string | null;
  confidence: number;
  source: ExtractionSource;
}
```

---

# 50. Extraction Source

Possible values:

```text id="x3m7q8"
DOM
SCHEMA
JSON_LD
OPEN_GRAPH
META
HEURISTIC
COMBINED
```

This allows the UI and diagnostics to understand why a field was selected.

---

# 51. Extraction Signals

A candidate may contain:

```json id="q5m8x3"
{
  "type": "SEMANTIC_ARTICLE",
  "weight": 0.30,
  "matched": true
}
```

Potential signal types:

```text id="m7x2q8"
SEMANTIC_ARTICLE
CONTAINS_H1
TEXT_DENSITY
LOW_LINK_DENSITY
SCHEMA_ARTICLE
JSON_LD_ARTICLE
OPEN_GRAPH_MATCH
ARTICLE_CLASS
ARTICLE_ID
HERO_IMAGE_RELATION
ADVERTISEMENT_PENALTY
NAVIGATION_PENALTY
```

Signals should be inspectable in development mode.

---

# 52. Article Structure Graph

The extraction result should conceptually represent relationships.

Example:

```text id="x8m3q2"
                 ARTICLE
                    │
        ┌───────────┼───────────┐
        │           │           │
       H1        HERO IMAGE    META
        │                       │
        │                 ┌─────┴─────┐
        │               AUTHOR       DATE
        │
        └───────────┐
                    │
                 ARTICLE BODY
```

This relationship model becomes useful later for:

- Keep Mode
- Composition
- Capture
- Presets
- AI

---

# 53. Article Container vs Body

These must remain separate concepts.

Article Container:

```text id="m5x8q3"
May include:
Title
Metadata
Image
Body
Share tools
```

Article Body:

```text id="q7m2v4"
Primarily editorial text content
```

A page may have:

```text id="v3m8x2"
ARTICLE
├── HEADER
├── TITLE
├── IMAGE
├── BODY
└── FOOTER
```

The extraction result should preserve this distinction.

---

# 54. Extraction and Cleanup

The Extraction Engine does not delete anything.

However, its result can be consumed by Cleanup.

Example:

```text id="x4m7q2"
Extraction
 ↓
article = .article
 ↓
Keep Mode
 ↓
Cleanup Proposal
 ↓
Mutation
```

This creates a controlled transition from understanding to action.

---

# 55. Extraction and Keep Mode

Keep Mode depends heavily on article extraction.

Workflow:

```text id="m8q3x5"
Detect Article
      ↓
User reviews
      ↓
Keep Article
      ↓
Cleanup analyzes outside region
```

If extraction confidence is low, Keep Mode should request manual selection.

---

# 56. Extraction and Composition

Composition Mode can use:

```text id="q5m7x3"
source
logo
title
hero image
body
date
author
```

to construct an editorial layout.

The extraction result therefore becomes the semantic input to Composition.

---

# 57. Extraction and Capture

Capture may request a specific extracted region:

```text id="v8m2q4"
Capture Article
```

The Extraction Engine returns the article selector.

The Capture Engine determines how to render it.

---

# 58. Extraction Timing

Extraction should normally occur after Freeze.

Recommended:

```text id="x3m7q8"
Page
 ↓
Freeze
 ↓
Extraction
 ↓
Inspector / Cleanup
```

This prevents the extraction result from becoming stale immediately.

---

# 59. Re-Extraction

The DOM can change after extraction.

The system should therefore support:

```text id="q7m4x2"
Re-analyze
```

This should generate a new ExtractionResult.

It must not silently change active cleanup rules.

---

# 60. Extraction Cache

Extraction results may be cached during a stable session.

Cache key:

```text id="m5x8q3"
sessionId
```

The cache becomes invalid when significant DOM mutations occur.

The system may mark:

```text id="v3q7m2"
Extraction = STALE
```

rather than automatically recomputing after every cleanup operation.

---

# 61. Extraction Invalidations

Extraction may become stale after:

```text id="x8m4q2"
Article container removed
Major DOM mutation
Page navigation
Reload
Large layout change
```

Small cosmetic cleanup operations need not invalidate the entire extraction result.

---

# 62. Incremental Extraction

Future versions may support partial re-analysis.

Example:

```text id="q4m8x7"
Hero image removed
 ↓
Recalculate hero image only
```

This is not required for MVP.

---

# 63. Performance

Extraction must not block the UI.

The engine should:

- Avoid repeated complete DOM traversal.
- Analyze only necessary subtrees.
- Cache metadata.
- Defer expensive analysis.
- Run deep analysis only when required.

---

# 64. Large DOM Strategy

For very large documents:

```text id="m7x3q5"
Candidate Generation
```

should prioritize likely regions:

```text id="v8m2q4"
MAIN
ARTICLE
sections containing H1
semantic content containers
```

before scanning every anonymous `<div>`.

This significantly reduces unnecessary computation.

---

# 65. Text Extraction

Text should be normalized carefully.

Normalization may include:

```text id="q5m8x3"
Whitespace normalization
Line-break normalization
Invisible text removal
Repeated whitespace reduction
```

The engine must preserve the actual page text semantically.

It must not rewrite or summarize it.

---

# 66. Hidden Content

The engine should distinguish between:

```text id="m4x7q2"
visible content
hidden content
display:none
visibility:hidden
opacity:0
offscreen content
```

Hidden text should generally receive lower extraction priority.

However, metadata hidden from visual rendering may still be useful for structured extraction.

---

# 67. Accessibility Signals

Potential useful signals include:

```text id="v8m3x5"
role="article"
aria-label
aria-labelledby
```

These should supplement, not replace, DOM and visual signals.

---

# 68. Semantic HTML

The engine should recognize:

```text id="q3m7x8"
main
article
header
section
aside
figure
figcaption
time
address
nav
```

Semantic relationships are useful for identifying article structure.

---

# 69. Figure Handling

A hero image may appear inside:

```text id="m5x8q2"
<figure>
  <img>
  <figcaption>
</figure>
```

The extraction engine should treat the figure as a potential editorial unit.

The image and caption should remain associated in the result.

---

# 70. Caption Detection

If an image contains:

```text id="v7m3x8"
<figcaption>
```

the engine may return:

```json id="q4m8x2"
{
  "text": "Caption",
  "selector": "figcaption",
  "confidence": 0.91
}
```

Captions are editorial content and should not be confused with advertisements.

---

# 71. Related Content Detection

Related content may be inside or near the article.

Potential indicators:

```text id="m8x3q7"
.related
.related-articles
.recommended
.more-stories
```

The extraction engine should classify these as likely non-body regions.

This information can later help Cleanup.

---

# 72. Comments Detection

Comments should generally be excluded from article body candidates.

Potential signals:

```text id="x5m7q2"
.comments
.comment-section
.discussion
```

However, comments may contain valuable editorial information in some workflows.

Therefore they should be classified, not automatically deleted.

---

# 73. Social Content Detection

Social widgets may appear inside or near articles.

Examples:

```text id="q7m3x8"
share buttons
embedded posts
social feeds
```

The extraction engine should identify them as auxiliary content.

It must not modify them.

---

# 74. Advertisement Detection Relationship

The Extraction Engine can provide negative signals to article candidates:

```text id="m4x8q2"
Advertisement region detected
```

But actual advertisement removal belongs to Cleanup Engine.

---

# 75. Source Identity Preservation

Source identity is considered high-value editorial metadata.

The extraction engine should attempt to identify:

```text id="v8m2q5"
Publisher
Logo
Domain
Site Name
```

This allows later composition to preserve attribution.

---

# 76. Canonical Article Identity

The engine should distinguish:

```text id="q3m7x8"
Page URL
Canonical URL
Article ID
```

where available.

The engine should not invent an article ID.

If a structured identifier exists, it may be recorded as metadata.

---

# 77. Multiple Articles on One Page

Some pages contain multiple article-like regions.

Examples:

```text id="m5x8q3"
Homepage
Search Results
News Feed
Category Page
```

The engine must determine whether the current page represents:

```text id="v7m2q4"
Single Article
```

or:

```text id="x3m8q7"
Article Listing
```

---

# 78. Single Article Detection

A page is more likely to be a single article when it has:

```text id="q4m7x2"
one dominant title
one dominant body
one primary image
article metadata
article structured data
```

---

# 79. Listing Page Detection

A listing page may contain:

```text id="m8x3q5"
many titles
many images
short excerpts
repeated article cards
```

The engine should return:

```text id="v7m2q4"
pageType = ARTICLE_LIST
```

rather than incorrectly identifying one card as the main article.

---

# 80. Page Type

Recommended enum:

```ts id="q5m8x3"
type PageType =
  | "ARTICLE"
  | "ARTICLE_LIST"
  | "CATEGORY"
  | "SEARCH"
  | "HOME"
  | "UNKNOWN";
```

MVP may initially support only:

```text id="m4x7q8"
ARTICLE
UNKNOWN
```

and expand later.

---

# 81. Extraction Metadata

The result should include:

```text id="v8m3q2"
analysisDuration
pageType
engineVersion
candidateCount
warnings
timestamp
```

This is useful for diagnostics.

---

# 82. Extraction Warnings

Examples:

```text id="q7m2x5"
Multiple H1 elements detected.
Article container confidence is medium.
Hero image could not be determined.
Structured data is malformed.
Page contains multiple article candidates.
```

Warnings should not block normal operation.

---

# 83. Extraction Diagnostics

Development mode may expose:

```text id="m5x8q3"
Candidate
Score
Signals
Rejected Candidates
Selected Candidate
Metadata Sources
```

This will be critical during testing against real news websites.

---

# 84. Explainability

For advanced users, the system should eventually be able to explain:

> Article container selected because it contains the primary H1, 27 paragraphs, low link density, and matching NewsArticle metadata.

This is particularly valuable when extraction confidence is imperfect.

---

# 85. Extraction Strategy Priority

The overall strategy is:

```text id="v3m8q2"
1. Structured Metadata
2. Semantic HTML
3. DOM Relationships
4. Content Density
5. Visual Geometry
6. Naming Heuristics
7. Combined Scoring
```

No single mechanism is considered authoritative in all cases.

---

# 86. Failure Strategy

If extraction fails:

```text id="q8m3x5"
ExtractionResult.article = null
```

The user should still be able to use:

```text id="m4x7q2"
Manual Inspector
Manual Cleanup
Manual Capture
```

Extraction failure must never disable the core product.

---

# 87. Manual Override

The user should be able to override extraction.

Example:

```text id="v5m8x2"
Automatic article:
.medium confidence

[Use detected article]

OR

[Select manually]
```

Once the user manually selects an article container, that selection becomes authoritative for the current session.

---

# 88. Manual Extraction

Future versions may allow:

```text id="q3m7x8"
Set as Title
Set as Hero Image
Set as Body
Set as Source
```

This converts the inspector into a semantic labeling tool.

It is a natural extension of the architecture.

---

# 89. Extraction and Presets

A future preset may contain extraction hints:

```json id="m8x3q5"
{
  "article": ".article-content",
  "title": ".article-title",
  "heroImage": ".hero img",
  "body": ".article-body"
}
```

These hints can significantly accelerate extraction on known websites.

However, they must be validated against the current DOM.

---

# 90. Preset Priority

For known websites:

```text id="v7m2q4"
Validated Preset Hint
   ↓
Current DOM Validation
   ↓
Extraction
```

A preset hint should be treated as a strong signal, not an unconditional truth.

---

# 91. Extraction and Smart Cleanup

Smart Cleanup may consume extraction results.

Example:

```text id="q4m8x3"
Article detected
      ↓
Protect article
      ↓
Analyze outside article
      ↓
Find likely noise
      ↓
Generate cleanup proposal
```

This is one of the most important integrations in NewsClean.

---

# 92. Extraction and Keep Mode

Keep Mode can use:

```text id="m5x8q2"
article selector
```

as the default protected region.

If confidence is high:

```text id="v3m7x8"
Keep Article
```

can become a fast workflow.

If confidence is low:

```text id="q8m2x4"
Manual selection required
```

---

# 93. Extraction and News Mode

News Mode should eventually use the Extraction Engine as its first intelligence layer.

Workflow:

```text id="m7x3q5"
NEWS MODE
   ↓
FREEZE
   ↓
EXTRACT
   ↓
IDENTIFY ARTICLE
   ↓
IDENTIFY NOISE
   ↓
PROPOSE CLEANUP
   ↓
REVIEW
   ↓
CLEAN
   ↓
CAPTURE
```

This is the foundation of one-click editorial capture.

---

# 94. Extraction API

Conceptual interface:

```ts id="q4m8x3"
interface ArticleExtractionEngine {
  analyze(
    options?: ExtractionOptions
  ): Promise<ExtractionResult>;

  getCachedResult(): ExtractionResult | null;

  invalidate(): void;

  isStale(): boolean;
}
```

---

# 95. Extraction Options

Conceptual:

```ts id="m8x3q5"
interface ExtractionOptions {
  mode?: "PASSIVE" | "STANDARD" | "DEEP";
  useMetadata?: boolean;
  useHeuristics?: boolean;
  includeDiagnostics?: boolean;
}
```

---

# 96. Extraction Contract

The engine guarantees:

```text id="v7m2q4"
1. No DOM mutation.
2. No content rewriting.
3. No external network dependency for core extraction.
4. Deterministic output for the same stable DOM and configuration.
5. Explicit confidence.
6. Explicit null when no reliable candidate exists.
```

---

# 97. Performance Requirements

Target for a normal article:

```text id="q5m8x3"
Passive extraction:
< 50 ms target

Standard extraction:
< 250 ms target

Deep extraction:
No strict MVP target
```

These are engineering targets, not user-visible guarantees.

The engine must prioritize responsiveness.

---

# 98. Memory Requirements

The engine must not store the entire DOM.

It should retain:

```text id="m4x7q2"
Selectors
References
Scores
Metadata
Extracted values
Diagnostics
```

Large article text should not be duplicated unnecessarily.

---

# 99. Security

The page is untrusted.

The Extraction Engine must treat:

```text id="v8m3x5"
JSON-LD
Meta content
Attributes
Text
URLs
Class names
```

as untrusted data.

Parsing structured metadata must be safe.

No extracted value may be interpreted as executable code.

---

# 100. No External Scraping

The MVP Extraction Engine operates on the currently loaded page.

It must not:

```text id="q3m8x7"
crawl the website
download other pages
query search engines
send content to external services
```

This preserves the Local-First principle.

---

# 101. Acceptance Criteria

The Article Extraction Engine is MVP-complete when it can:

```text id="m5x8q2"
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
```

---

# 102. Future Extensions

Potential future capabilities:

```text id="v7m3q8"
Advanced semantic extraction
Readability-style content scoring
Language detection
Multilingual article heuristics
Automatic caption extraction
Video poster detection
Article chronology detection
Paywall detection
Embedded media classification
AI semantic extraction
Local LLM extraction
Website-specific extraction profiles
Shared newsroom extraction rules
```

These should extend the existing ExtractionResult contract.

---

# 103. AI Integration Boundary

Future AI must integrate through an Analyzer interface.

Current:

```text id="q4m8x2"
Heuristic Analyzer
```

Future:

```text id="m8x3q5"
AI Analyzer
```

Both produce:

```text id="v7m2q4"
ExtractionResult
```

The rest of the system should not care how the result was produced.

This preserves architectural flexibility.

---

# 104. Extraction Pipeline — Final

The final conceptual pipeline is:

```text id="x5m8q3"
                     WEB PAGE
                        │
                        ▼
                ┌───────────────┐
                │ DOCUMENT SCAN │
                └───────┬───────┘
                        ▼
             ┌─────────────────────┐
             │ SEMANTIC DISCOVERY  │
             └──────────┬──────────┘
                        ▼
             ┌─────────────────────┐
             │ METADATA DISCOVERY  │
             └──────────┬──────────┘
                        ▼
             ┌─────────────────────┐
             │ CANDIDATE GENERATOR │
             └──────────┬──────────┘
                        ▼
             ┌─────────────────────┐
             │ SIGNAL / SCORING    │
             └──────────┬──────────┘
                        ▼
             ┌─────────────────────┐
             │ STRUCTURE RESOLVER  │
             └──────────┬──────────┘
                        ▼
             ┌─────────────────────┐
             │ VALIDATION          │
             └──────────┬──────────┘
                        ▼
               EXTRACTION RESULT
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
       CLEANUP        COMPOSE        CAPTURE
```

---

# 105. Architectural Invariants

The following rules are mandatory:

```text id="m7x3q5"
1. Extraction is read-only.
2. Extraction never directly mutates the DOM.
3. Extraction never deletes content.
4. Extraction never rewrites article text.
5. Extraction must produce explicit confidence.
6. Extraction must prefer UNKNOWN over an unreliable guess.
7. Semantic HTML is a signal, not absolute truth.
8. Metadata is a signal, not absolute truth.
9. Multiple candidates must be scored when ambiguity exists.
10. Article container and article body are distinct concepts.
11. Hero image detection must consider semantic context.
12. Source identity should be preserved.
13. Structured metadata must be parsed safely.
14. Extraction operates locally in the MVP.
15. Extraction results are session-scoped.
16. Stale extraction results must be detectable.
17. Manual user selection can override automatic extraction.
18. Cleanup owns mutation.
19. Capture owns rendering.
20. Future AI must plug into the extraction boundary rather than bypass it.
```

---

# 106. Next Document

The next document is:

`08-CAPTURE-ENGINE.md`

It will define the rendering and export pipeline:

```text id="q4m8x2"
Visible Capture
Full Article Capture
Selection Capture
Composition Capture
Viewport Control
Full-Page Measurement
High-DPI Rendering
Device Pixel Ratio
PNG Encoding
Transparent / Solid Background
Capture Without UI
Long Article Rendering
Image Quality
Export Naming
Capture Failure Recovery
```

The Capture Engine will consume the cleaned and optionally extracted page state and turn it into the final production asset.