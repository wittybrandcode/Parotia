# NewsClean — Site Preset System

**Document ID:** `09-PRESET-SYSTEM`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`

## 1. Purpose

The Preset System is a reusable, site-specific configuration layer that lets NewsClean remember how a particular news website is structured so repeated newsroom workflows become faster and more deterministic. Instead of manually identifying the same elements every time (advertisement, sidebar, newsletter, social widgets, related articles, cookie banner, article container, article title, hero image, article body), the system applies a validated site preset.

## 2. Core Principle

The Preset System is an acceleration layer, not an authority layer. A preset must never assume a website remains unchanged forever; the current webpage is always authoritative — `Preset → Current DOM → Validation → Apply valid rules`, never `Preset → Blind DOM manipulation`. The Preset System is a rules-not-DOM system: it never directly mutates the page; it produces configuration that other engines execute.

## 3. Problem

Newsrooms repeatedly capture content from the same sources (e.g. ExampleNews.com, ExampleTV.com, ExampleAgency.com). Manual capture requires: inspect → identify ad → delete ad → identify sidebar → delete sidebar → identify newsletter → delete newsletter → identify article → capture. A preset reduces this to: open article → freeze → apply preset → review → capture — reducing repetitive manual work without sacrificing editorial control.

## 4. Preset Scope

A preset may define: site identity, article extraction hints, cleanup rules, protected elements, optional capture defaults, preset metadata. It must not contain arbitrary JavaScript.

Components: identity, matching, extraction hints, cleanup rules, protection rules, capture defaults, metadata.

## 5. Site Identity & Matching

- **Hostname:** the hostname is the primary identity (`"site": { "hostname": "example.com" }`). Matching uses a normalized hostname — `https://www.example.com/article` becomes `www.example.com` — distinguishing `example.com` from `www.example.com` and from unrelated domains.
- **Subdomains:** a preset may optionally list multiple hostnames (`"matching": { "hostnames": ["news.example.com", "www.example.com"] }`). Wildcard matching is not the default.
- **Paths:** a preset may optionally define URL path patterns (`"matching": { "paths": ["/news/*"] }`) for sites with different layouts (e.g. `example.com/news/*`, `/sport/*`, `/video/*`). Path matching must remain deterministic.
- **Matching priority:** when several presets match, the most specific wins: exact hostname + path > exact hostname > parent-domain rule. `news.example.com/news/*` beats `example.com`.
- **No global blind preset:** MVP does not support a preset that silently applies to every website. Global cleanup behavior belongs to Smart Cleanup; Site Presets are specifically intended for known structures.

## 6. Preset ID & Versioning

- Every preset requires a stable identifier (`"id": "preset.example-news"`) that remains stable across preset updates.
- Every preset includes a version (`"version": 3`).
- Preset data version and preset instance version are separate concepts: `schemaVersion` describes the NewsClean preset format; `version` describes the specific site preset revision.

```json
{ "schemaVersion": 1, "version": 3 }
```

## 7. Complete Preset Structure

```json
{
  "schemaVersion": 1,
  "id": "preset.example-news",
  "version": 1,
  "site": { "hostname": "example.com" },
  "matching": { "paths": [] },
  "extraction": {
    "article": [],
    "title": [],
    "subtitle": [],
    "heroImage": [],
    "body": [],
    "author": [],
    "publicationDate": [],
    "logo": []
  },
  "cleanup": { "rules": [] },
  "protection": { "rules": [] },
  "capture": { "mode": "ELEMENT" },
  "metadata": { "name": "Example News", "author": "NewsClean" }
}
```

## 8. Extraction Hints

Extraction hints provide selectors likely to identify editorial elements (article, title, subtitle, hero image, body, author, publication date, logo). They are hints — the Extraction Engine must validate them. Multiple selectors may be specified per field; they are evaluated in order, and the first valid, high-confidence candidate becomes the preferred result:

```json
{
  "article": ["article.article", ".story-container", ".article-content"]
}
```

## 9. Selector Validation

Every preset selector is validated against the current DOM: syntax, match count, element type, visibility, context, expected structure. An invalid selector must not break the preset.

- **Stale selector:** a website redesign may invalidate a selector. If it produces 0 matches, the engine marks it `STALE` rather than failing the entire preset.
- **Multiple matches:** if an extraction selector matches 7 elements when the preset expects one article body, the engine must not blindly choose the first; it applies extraction scoring (e.g. article scoring resolver).

## 10. Cleanup Rules

Cleanup rules define known non-editorial components:

```json
{ "cleanup": { "rules": [ { "action": "DELETE", "selector": ".advertisement" } ] } }
```

```ts
interface PresetCleanupRule {
  id: string;
  action: "DELETE" | "HIDE" | "KEEP";
  selector: string;
  scope?: "ELEMENT" | "MATCHES";
  enabled: boolean;
}
```

- **Rule ID:** every rule has a stable ID (e.g. `ads-main`, `sidebar`, `newsletter`, `social-share`) so rules can be enabled, disabled, modified, or reported without identifying them solely by selector.
- **Categories:** rules may optionally carry a category — `ADVERTISEMENT`, `SIDEBAR`, `NEWSLETTER`, `SOCIAL`, `COOKIE`, `RELATED`, `NAVIGATION`, `PROMOTION`, `OTHER` — for diagnostics and UI presentation.
- **Scope:** `ELEMENT` for a unique element (e.g. `#main-header`); `MATCHES` when multiple may exist (e.g. `.sidebar`).
- **Actions:** MVP actions `DELETE`, `HIDE`, `KEEP` — exactly the semantics defined by `06-CLEANUP-ENGINE.md`; the Preset System must not invent separate mutation semantics.

## 11. Protection Rules

A preset may identify elements that should normally remain untouched:

```json
{ "protection": { "rules": [ { "selector": "article.article", "action": "KEEP" } ] } }
```

Protection follows the existing Cleanup Engine hierarchy: `Explicit User KEEP > Preset KEEP > Manual Target > Preset DELETE > Smart Cleanup`. Final conflict resolution must remain deterministic. A preset never overrides user intent: if the preset says `KEEP .article-body` and the user says `DELETE .article-body`, the explicit user action wins; the preset must not silently restore the element.

## 12. Application Pipeline

```text
URL
 ↓
Preset Resolver
 ↓
Matching Preset
 ↓
Validate Preset
 ↓
Extraction Hints + Cleanup Proposal
 ↓
User Review
 ↓
Cleanup Engine
```

The Preset System does not directly mutate the page. Unmatched selectors are reported ("Rule unmatched"), never fatal: other valid rules still execute (Ads → 5 matches ✓, Newsletter → 1 match ✓, Sidebar → 0 matches, Social → 3 matches ✓); the Cleanup Engine applies the valid rules and reports the stale rule.

## 13. Automatic vs Manual Application

MVP supports `MANUAL APPLY` and optionally `AUTO SUGGEST`. Automatic mutation must not occur merely because a preset matches. Recommended UX: `Preset detected: Example News — [Apply Preset]`. The user remains in control. Future versions may allow trusted presets to auto-apply, but only with an explicit user preference — and preset rules must still pass through the Cleanup Engine.

## 14. Preset Trust

A preset has a trust state: `BUILT_IN`, `USER_CREATED`, `IMPORTED`, `COMMUNITY`. The MVP distinguishes these sources.

- **Built-in:** distributed with NewsClean; versioned, validated, reviewed; useful for major news sites frequently used by the newsroom.
- **User-created:** created from the current page: clean page → save site preset → review rules → name preset → save. The generated preset contains only explicit rules. When a user manually deletes `.ad`, `.sidebar`, `.newsletter`, NewsClean may offer "Save these cleanup rules for this site?".
- **Automatic rule recording:** MVP may record manually applied cleanup actions during a session, but automatic conversion into a reusable preset requires user confirmation. The system must not silently learn cleanup behavior.

## 15. Preset Editing

A preset editor should eventually support: enable/disable, add rule, remove rule, edit selector, test rule, test extraction, reorder, save version.

## 16. Rule Testing & Validation

`TEST PRESET` validates the preset against the current page:

```text
Article: ✓ 1 match | Title: ✓ 1 match | Hero: ✓ 1 match | Body: ✓ 1 match | Ads: ✓ 4 matches | Sidebar: ✓ 1 match
```

Validation report:

```json
{
  "preset": "preset.example-news",
  "valid": true,
  "checks": {
    "article": { "status": "PASS", "matches": 1 },
    "title":   { "status": "PASS", "matches": 1 },
    "body":    { "status": "PASS", "matches": 1 },
    "ads":     { "status": "PASS", "matches": 4 }
  }
}
```

## 17. Preset Health

A preset has a health state derived from validation:

- `HEALTHY` — core selectors match expected structures.
- `DEGRADED` — some optional rules no longer match.
- `STALE` — important selectors no longer match.
- `BROKEN` — the preset cannot reliably identify its target structure.

Rules may be required or optional (`"required": true` / `"required": false`). Example: article selector → required; newsletter selector → optional. A missing optional rule does not invalidate the preset. If `article = 0 matches`, the preset becomes `STALE` and must not automatically perform article-specific cleanup; if `newsletter = 0 matches`, it can remain `HEALTHY` — the newsletter may simply not be present on that page.

## 18. Fallbacks

- **Extraction:** if preset extraction hints fail (preset hint → no valid match), degrade gracefully to the standard Extraction Engine.
- **Cleanup:** if one cleanup rule fails (`0 matches`), the other valid rules still execute and the stale rule is reported.

## 19. Preset Confidence

A preset exposes an overall confidence/health signal based on validation (e.g. Health 92%, Article HIGH, Title HIGH, Body HIGH, Sidebar MEDIUM). The numerical score is optional UI presentation; internally the system preserves detailed validation results.

## 20. Preset and Other Engines

- **Smart Cleanup:** preset rules are stronger than generic Smart Cleanup (preset `.sidebar → DELETE` beats Smart Cleanup's uncertainty), but user intent always wins (`KEEP .sidebar` overrides preset `DELETE .sidebar`).
- **Extraction:** the Preset System does not duplicate the Extraction Engine — it provides hints: Preset → Hints → Extraction Engine → ExtractionResult. One canonical extraction implementation.
- **Capture:** presets may define capture defaults (`"capture": { "mode": "ELEMENT" }`) meaning "capture article" is the preferred workflow, but the preset never executes capture automatically. Possible fields: mode, scale, target; MVP keeps this minimal (mode only).

## 21. Rendering Boundary

A preset must not contain CSS rewriting, font injection, layout reconstruction, or image editing — these belong to future rendering/composition systems.

## 22. Selector Types & Safety

MVP selectors are CSS selectors only (`article.article`, `.article-body`, `#newsletter`, `aside.sidebar`, `header.site-header`). XPath is not required. Arbitrary JavaScript selectors are forbidden. Preset selectors are configuration data: the system must never execute `eval()`, `new Function()`, or any equivalent; selectors pass only to safe DOM APIs.

Imported presets are untrusted configuration — the preset system allows CSS selectors only and must never support arbitrary executable scripts. The preset schema must reject executable actions:

```json
{ "action": "javascript:..." }
```

```json
{ "script": "..." }
```

This is a hard invariant.

## 23. Selector Stability

- **Specificity:** selectors should be as stable as practical — prefer `article.article` over `body > div:nth-child(4) > div:nth-child(2)`. The preset editor may warn about fragile selectors.
- **Fragile detection:** `:nth-child()`, `:nth-of-type()`, deep anonymous hierarchy, and generated CSS classes may be flagged ("Selector appears fragile.") but never automatically rejected — some websites require structural selectors.
- **Preference:** ID > semantic class > data attributes > semantic elements > position-based selectors (e.g. `#article`, `article.article`, `[data-testid="article"]`, `article`, `div:nth-child(4)`).
- **Generation:** when saving a manually selected element, generate a stable selector — user selected `<div class="article-body">` → generate `.article-body`, not a structural path. Generated selectors are tested with `document.querySelectorAll(selector).length`; for an expected unique target `count === 1`; if not unique, improve specificity.
- **Generator fallback sequence:** ID → unique class → data attribute → semantic path → structural path. The generated selector must remain valid CSS.

## 24. Preset Storage

MVP storage is local via `chrome.storage.local` (`Chrome Storage → Preset Repository → Preset Resolver`); no backend is required. Preset data is separate from session state, cleanup history, and capture files — a preset is reusable configuration, a session is temporary state.

```ts
interface PresetRepository {
  get(id: string): Promise<SitePreset | null>;
  save(preset: SitePreset): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<SitePreset[]>;
}
```

## 25. Preset Lifecycle & Resolution

Lifecycle: `DISCOVER → LOAD → VALIDATE → SUGGEST → APPLY → USE` (then optional `UPDATE`).

The resolver determines which preset applies to the current URL; resolution must be deterministic: normalize URL → extract hostname → find exact hostname presets → evaluate path conditions → rank matches → return highest-specificity preset.

```ts
interface PresetResolver {
  resolve(url: string): Promise<SitePreset | null>;
}
```

**Conflict:** if two presets have equal specificity, the resolver must not choose randomly. Recommended priority when the user explicitly created a site-specific override: User-created > Imported > Built-in. The user can always override a built-in preset (built-in `example.com` vs user `example.com` → the user's preset takes precedence), enabling newsroom-specific workflows.

**Inheritance:** preset inheritance (base → region → user → department) is not required for MVP; keeping presets flat reduces complexity.

## 26. Import / Export / Update

- **Import:** importing JSON presets is a future feature. Imported presets must be validated against the schema before storage; invalid files are rejected.
- **Export:** users may export `site-preset.json` for backup or sharing. The export contains configuration only — never article text, captured screenshots, browser cookies, or session data.
- **Sharing:** a shared preset repository (e.g. Creative Department → Shared Site Presets → All Workstations) requires a separate synchronization architecture and is outside MVP.
- **Update:** on update (version 1 → 2), preserve the previous version where practical; at minimum the new version atomically replaces the active local configuration. Save flow is `validate → save`, never `save partial → validate`; a broken preset must never become the active stored version. Future versions support rollback to a previous version.

## 27. Diagnostics & Testing

- **Diagnostics:** development mode exposes: preset ID, version, hostname, path match, rule count, extraction hint count, validation results, health.
- **Test harness:** the architecture allows testing a preset against fixture HTML without opening Chrome (Preset + fixture → verify expected article, title, body, cleanup targets).

```text
fixtures/example-news/{ article-01.html, article-02.html, redesign-01.html }
```

- **Regression:** when a preset changes, the test suite verifies that v1 behavior has not been unintentionally broken unless explicitly intended.
- **Test result:**

```json
{
  "preset": "preset.example-news",
  "passed": true,
  "tests": [
    { "name": "article-container", "status": "PASS" },
    { "name": "title", "status": "PASS" },
    { "name": "body", "status": "PASS" },
    { "name": "advertisement-cleanup", "status": "PASS" }
  ]
}
```

## 28. Site Redesign & Stale Presets

A preset becomes stale when core selectors fail (article, title, body). Detection happens during validation — the system must not silently assume the preset still works. Stale preset UX: `Site preset needs review. Example News changed its page structure. 3 of 8 rules still match.` Actions: review, disable, edit preset, use standard extraction.

Automatic selector repair is outside MVP; future versions may suggest replacements (`Old: .article-body` → `Possible replacement: .story-content`) but the user must approve. Learning from repeated manual cleanup is future work and must be explicit, reviewable, and reversible — the system must never silently modify presets based on one accidental deletion.

## 29. Rule Provenance & Statistics

Each rule may optionally record its origin — `BUILT_IN`, `USER`, `IMPORTED`, `GENERATED` — to determine trust and maintenance. Future diagnostics may show per-rule statistics (`.sidebar — Applied: 132, Successful: 129, No match: 3`) to identify stale rules; not required for MVP.

## 30. Example Preset

```json
{
  "schemaVersion": 1,
  "id": "preset.example-news",
  "version": 1,
  "site": { "hostname": "example.com" },
  "extraction": {
    "article": ["article.article"],
    "title": ["h1.article-title"],
    "heroImage": [".article-hero img"],
    "body": [".article-body"],
    "author": [".article-author"],
    "publicationDate": ["time[datetime]"]
  },
  "cleanup": {
    "rules": [
      { "id": "ads", "category": "ADVERTISEMENT", "action": "DELETE", "selector": ".advertisement", "scope": "MATCHES", "enabled": true },
      { "id": "sidebar", "category": "SIDEBAR", "action": "DELETE", "selector": ".sidebar", "scope": "MATCHES", "enabled": true },
      { "id": "newsletter", "category": "NEWSLETTER", "action": "DELETE", "selector": ".newsletter", "scope": "MATCHES", "enabled": true }
    ]
  },
  "protection": {
    "rules": [
      { "id": "article", "selector": "article.article", "action": "KEEP" }
    ]
  },
  "capture": { "mode": "ELEMENT" },
  "metadata": { "name": "Example News", "author": "NewsClean" }
}
```

## 31. Application Example & Result

Newsroom workflow: open article → NewsClean detects Example News preset → freeze → validate preset → article detected → cleanup proposal (Advertisement × 4, Sidebar × 1, Newsletter × 1) → user reviews → apply → capture article → PNG.

```json
{ "preset": "preset.example-news", "status": "APPLIED", "extraction": { "article": "HIGH", "title": "HIGH", "body": "HIGH" }, "cleanup": { "applied": 3, "skipped": 0, "stale": 1 } }
```

## 32. Preset State & API

```ts
interface PresetState {
  activePreset: SitePreset | null;
  health: "HEALTHY" | "DEGRADED" | "STALE" | "BROKEN";
  validation: PresetValidationResult | null;
}
```

State is session-level; the stored preset remains independent.

```ts
interface SitePresetEngine {
  resolve(url: string): Promise<SitePreset | null>;
  validate(preset: SitePreset): Promise<PresetValidationResult>;
  apply(preset: SitePreset): Promise<PresetApplicationResult>;
  createFromSession(): Promise<SitePreset>;
  save(preset: SitePreset): Promise<void>;
}
```

## 33. Architectural Boundaries

The Preset System DOES: identify site configuration, provide extraction hints, provide cleanup rules, provide protection rules, provide capture defaults, validate configuration, resolve matching presets.

It DOES NOT: directly mutate DOM, execute JavaScript, capture screenshots, encode PNG, perform article cleanup itself, replace the Extraction Engine, or replace the Cleanup Engine.

## 34. Acceptance Criteria & Invariants

The Site Preset System is MVP-complete when the following hold:

1. A preset can be associated with a hostname and optionally match URL paths; presets have stable IDs and versions.
2. Presets can define extraction selectors, cleanup rules, protection rules, and a capture default.
3. Presets are validated against the current DOM; invalid selectors do not break the page; invalid selectors fail safely.
4. Stale rules are reported; optional stale rules do not invalidate the whole preset; required stale rules degrade the preset state.
5. Preset rules pass through the Cleanup Engine; preset extraction hints pass through the Extraction Engine; preset application does not directly manipulate the DOM.
6. User actions override preset actions; the current DOM state is authoritative.
7. Presets are configuration, not executable code, and cannot execute arbitrary JavaScript.
8. Presets are stored locally and can be versioned; preset matching is deterministic.
9. Built-in and user-created presets are distinguishable; presets never remove editorial control.
10. A fallback to standard extraction is available; a preset can be tested against the current page.
11. Presets remain local in MVP and must not contain JavaScript, article content, captured images, or session state.
12. Preset application must be reversible through existing Cleanup history.
13. Site presets are site-specific; global cleanup belongs to Smart Cleanup.
