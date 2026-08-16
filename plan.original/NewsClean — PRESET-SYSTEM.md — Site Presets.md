# NewsClean

## Site Preset System

**Document ID:** `09-PRESET-SYSTEM`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`

---

## 1. Purpose

The Preset System provides a reusable, site-specific configuration layer for NewsClean.

Its purpose is to allow NewsClean to remember how a particular news website is structured so that repeated newsroom workflows become faster and more deterministic.

Instead of manually identifying the same elements every time:

```text
Advertisement
Sidebar
Newsletter
Social widgets
Related articles
Cookie banner
Article container
Article title
Hero image
Article body
```

the system can apply a validated site preset.

The fundamental concept is:

```text
SITE
 ↓
PRESET
 ↓
KNOWN STRUCTURE
 ↓
EXTRACTION HINTS
 ↓
CLEANUP RULES
 ↓
FAST WORKFLOW
```

---

# 2. Core Principle

The Preset System is an acceleration layer, not an authority layer.

A preset must never assume that a website remains unchanged forever.

Therefore:

```text
Preset
   ↓
Current DOM
   ↓
Validation
   ↓
Apply valid rules
```

and never:

```text
Preset
   ↓
Blind DOM manipulation
```

The current webpage always remains authoritative.

---

# 3. Problem

Newsrooms repeatedly capture content from the same sources.

For example, an operator may work repeatedly with:

```text
ExampleNews.com
ExampleTV.com
ExampleAgency.com
```

Every capture currently requires:

```text
Inspect
→ identify ad
→ delete ad
→ identify sidebar
→ delete sidebar
→ identify newsletter
→ delete newsletter
→ identify article
→ capture
```

A preset transforms this into:

```text
Open article
→ Freeze
→ Apply Preset
→ Review
→ Capture
```

The goal is to reduce repetitive manual work without sacrificing editorial control.

---

# 4. Preset Scope

A preset may define:

```text
Site identity
Article extraction hints
Cleanup rules
Protected elements
Optional capture defaults
Preset metadata
```

It must not contain arbitrary JavaScript.

---

# 5. Preset Components

Conceptually:

```text
PRESET
├── Identity
├── Matching
├── Extraction Hints
├── Cleanup Rules
├── Protection Rules
├── Capture Defaults
└── Metadata
```

---

# 6. Site Identity

A preset must identify the site it belongs to.

Example:

```json
{
  "site": {
    "hostname": "example.com"
  }
}
```

The hostname is the primary identity.

---

# 7. Hostname Matching

The system should distinguish:

```text
example.com
www.example.com
```

from unrelated domains.

A normalized hostname should be used internally.

Example:

```text
https://www.example.com/article
```

becomes:

```text
www.example.com
```

for matching purposes.

---

# 8. Subdomain Matching

Some publishers use multiple subdomains:

```text
news.example.com
sports.example.com
video.example.com
```

A preset may optionally specify:

```json
{
  "matching": {
    "hostnames": [
      "news.example.com",
      "www.example.com"
    ]
  }
}
```

Wildcard matching should not be the default.

---

# 9. Path Matching

Some sites have different layouts.

Example:

```text
example.com/news/*
example.com/sport/*
example.com/video/*
```

A preset may optionally define URL path patterns.

Example:

```json
{
  "matching": {
    "paths": [
      "/news/*"
    ]
  }
}
```

Path matching must remain deterministic.

---

# 10. Preset Matching Priority

When several presets match:

```text
Exact hostname + path
>
Exact hostname
>
Parent-domain rule
```

The most specific preset wins.

Example:

```text
news.example.com/news/*
```

has priority over:

```text
example.com
```

---

# 11. No Global Blind Preset

The MVP should not support a preset that silently applies to every website.

Global cleanup behavior belongs to:

```text
Smart Cleanup
```

Site Presets are specifically intended for known structures.

---

# 12. Preset ID

Every preset requires a stable identifier.

Example:

```json
{
  "id": "preset.example-news"
}
```

The ID should remain stable across preset updates.

---

# 13. Preset Version

Every preset must include a version.

Example:

```json
{
  "version": 3
}
```

This allows the system to evolve the schema without breaking existing presets.

---

# 14. Preset Schema Version

Preset data version and preset instance version are separate concepts.

Example:

```json
{
  "schemaVersion": 1,
  "version": 3
}
```

`schemaVersion` describes the NewsClean preset format.

`version` describes the specific site preset revision.

---

# 15. Complete Preset Structure

Conceptual:

```json
{
  "schemaVersion": 1,
  "id": "preset.example-news",
  "version": 1,

  "site": {
    "hostname": "example.com"
  },

  "matching": {
    "paths": []
  },

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

  "cleanup": {
    "rules": []
  },

  "protection": {
    "rules": []
  },

  "capture": {
    "mode": "ELEMENT"
  },

  "metadata": {
    "name": "Example News",
    "author": "NewsClean"
  }
}
```

---

# 16. Extraction Hints

Extraction hints provide selectors that are likely to identify editorial elements.

Example:

```json
{
  "extraction": {
    "article": [
      "article.article"
    ],
    "title": [
      "h1.article-title"
    ],
    "body": [
      ".article-body"
    ]
  }
}
```

These are hints.

The Extraction Engine must validate them.

---

# 17. Selector Priority

Multiple selectors may be specified.

Example:

```json
{
  "article": [
    "article.article",
    ".story-container",
    ".article-content"
  ]
}
```

The engine evaluates them in order.

The first valid, high-confidence candidate may become the preferred result.

---

# 18. Selector Validation

Every preset selector must be validated against the current DOM.

Validation includes:

```text
Syntax
Match count
Element type
Visibility
Context
Expected structure
```

An invalid selector must not break the preset.

---

# 19. Stale Selector

A website redesign may invalidate:

```text
.article-body
```

If the selector produces:

```text
0 matches
```

the engine should mark it:

```text
STALE
```

rather than failing the entire preset.

---

# 20. Multiple Matches

If an extraction selector matches:

```text
7 elements
```

when the preset expects one article body, the engine must not blindly choose the first.

It should apply extraction scoring.

Example:

```text
Selector:
.article-body

Matches:
7

Resolver:
Article scoring
```

---

# 21. Cleanup Rules

Cleanup rules define known non-editorial components.

Example:

```json
{
  "cleanup": {
    "rules": [
      {
        "action": "DELETE",
        "selector": ".advertisement"
      }
    ]
  }
}
```

---

# 22. Cleanup Rule Structure

Conceptual:

```ts
interface PresetCleanupRule {
  id: string;
  action: "DELETE" | "HIDE" | "KEEP";
  selector: string;
  scope?: "ELEMENT" | "MATCHES";
  enabled: boolean;
}
```

---

# 23. Rule ID

Every rule should have a stable ID.

Example:

```text
ads-main
sidebar
newsletter
social-share
```

This allows:

```text
enable
disable
modify
report
```

without identifying rules solely by selector.

---

# 24. Rule Categories

Rules may optionally contain categories:

```text
ADVERTISEMENT
SIDEBAR
NEWSLETTER
SOCIAL
COOKIE
RELATED
NAVIGATION
PROMOTION
OTHER
```

Example:

```json
{
  "id": "sidebar",
  "category": "SIDEBAR",
  "action": "DELETE",
  "selector": ".sidebar"
}
```

Categories improve diagnostics and UI presentation.

---

# 25. Rule Scope

A cleanup rule may operate on:

```text
ELEMENT
MATCHES
```

For:

```text
.sidebar
```

`MATCHES` is appropriate if multiple sidebars may exist.

For a unique element:

```text
#main-header
```

`ELEMENT` may be appropriate.

---

# 26. Rule Action

MVP actions:

```text
DELETE
HIDE
KEEP
```

The same semantics defined by `06-CLEANUP-ENGINE.md` apply here.

The Preset System must not invent separate mutation semantics.

---

# 27. Preset Protection Rules

A preset may identify elements that should normally remain untouched.

Example:

```json
{
  "protection": {
    "rules": [
      {
        "selector": "article.article",
        "action": "KEEP"
      }
    ]
  }
}
```

This protects the known article structure from broad cleanup rules.

---

# 28. Protection Priority

Protection follows the existing Cleanup Engine hierarchy:

```text
Explicit User KEEP
>
Preset KEEP
>
Manual Target
>
Preset DELETE
>
Smart Cleanup
```

The exact final conflict resolution must remain deterministic.

---

# 29. Preset Does Not Override User Intent

Example:

Preset:

```text
KEEP .article-body
```

User:

```text
DELETE .article-body
```

The explicit user action wins.

The preset should not silently restore the element.

---

# 30. Preset Application

Preset application follows:

```text
URL
 ↓
Preset Resolver
 ↓
Matching Preset
 ↓
Validate Preset
 ↓
Extraction Hints
 ↓
Cleanup Proposal
 ↓
User Review
 ↓
Cleanup Engine
```

The Preset System does not directly mutate the page.

---

# 31. Automatic vs Manual Application

The MVP should support:

```text
MANUAL APPLY
```

and optionally:

```text
AUTO SUGGEST
```

Automatic mutation should not occur merely because a preset matches.

Recommended:

```text
Preset detected:
Example News

[Apply Preset]
```

The user remains in control.

---

# 32. Preset Auto-Apply

Future versions may allow trusted presets to auto-apply.

This should require an explicit user preference.

Example:

```text
Auto-apply trusted presets
```

Even then, preset rules should still pass through the Cleanup Engine.

---

# 33. Preset Trust

A preset can have a trust state:

```text
BUILT_IN
USER_CREATED
IMPORTED
COMMUNITY
```

The MVP should distinguish these sources.

---

# 34. Built-In Presets

Built-in presets are distributed with NewsClean.

They should be:

```text
versioned
validated
reviewed
```

They are useful for major news sites frequently used by the newsroom.

---

# 35. User-Created Presets

Users should eventually be able to create a preset from the current page.

Workflow:

```text
Clean Page
 ↓
Save Site Preset
 ↓
Review Rules
 ↓
Name Preset
 ↓
Save
```

The generated preset should contain only explicit rules.

---

# 36. Preset Creation

Example:

User manually deletes:

```text
.ad
.sidebar
.newsletter
```

NewsClean may offer:

```text
Save these cleanup rules for this site?
```

This is a natural evolution of the manual workflow.

---

# 37. Automatic Rule Recording

The MVP may record manually applied cleanup actions during a session.

However, automatic conversion into a reusable preset should require user confirmation.

The system must not silently learn cleanup behavior.

---

# 38. Preset Editing

A preset editor should eventually support:

```text
Enable / Disable
Add Rule
Remove Rule
Edit Selector
Test Rule
Test Extraction
Reorder
Save Version
```

---

# 39. Rule Testing

A preset should provide a validation operation:

```text
TEST PRESET
```

Output:

```text
Article:
✓ 1 match

Title:
✓ 1 match

Hero:
✓ 1 match

Body:
✓ 1 match

Ads:
✓ 4 matches

Sidebar:
✓ 1 match
```

---

# 40. Preset Validation Report

Conceptual:

```json
{
  "preset": "preset.example-news",
  "valid": true,
  "checks": {
    "article": {
      "status": "PASS",
      "matches": 1
    },
    "title": {
      "status": "PASS",
      "matches": 1
    },
    "body": {
      "status": "PASS",
      "matches": 1
    },
    "ads": {
      "status": "PASS",
      "matches": 4
    }
  }
}
```

---

# 41. Preset Health

A preset may have a health state:

```text
HEALTHY
DEGRADED
STALE
BROKEN
```

### HEALTHY

Core selectors match expected structures.

### DEGRADED

Some optional rules no longer match.

### STALE

Important selectors no longer match.

### BROKEN

The preset cannot reliably identify its target structure.

---

# 42. Required vs Optional Rules

Preset rules may be:

```json
{
  "required": true
}
```

or:

```json
{
  "required": false
}
```

Example:

```text
Article selector
→ required

Newsletter selector
→ optional
```

A missing optional rule should not invalidate the preset.

---

# 43. Preset Validation Policy

If:

```text
article = 0 matches
```

the preset should become:

```text
STALE
```

and should not automatically perform article-specific cleanup.

If:

```text
newsletter = 0 matches
```

the preset can remain:

```text
HEALTHY
```

because the newsletter may simply not be present on that page.

---

# 44. Extraction Fallback

If preset extraction hints fail:

```text
Preset Hint
   ↓
No valid match
   ↓
Standard Extraction Engine
```

The preset must degrade gracefully to general extraction.

---

# 45. Cleanup Fallback

If one cleanup rule fails:

```text
.sidebar → 0 matches
```

other valid rules may still execute.

Example:

```text
Ads → 5 matches ✓
Newsletter → 1 match ✓
Sidebar → 0 matches
Social → 3 matches ✓
```

The Cleanup Engine can apply the valid rules and report the stale rule.

---

# 46. Preset Confidence

A preset should expose an overall confidence/health signal based on validation.

Example:

```text
Preset:
Example News

Health:
92%

Article:
HIGH

Title:
HIGH

Body:
HIGH

Sidebar:
MEDIUM
```

The numerical score is optional UI presentation.

The internal system should preserve detailed validation results.

---

# 47. Preset and Smart Cleanup

Preset rules should be stronger than generic Smart Cleanup.

Example:

```text
Preset:
.sidebar → DELETE

Smart Cleanup:
.sidebar → uncertain
```

The known site-specific rule wins.

However:

```text
Preset:
.sidebar → DELETE

User:
KEEP .sidebar
```

User intent wins.

---

# 48. Preset and Extraction

The Preset System should not duplicate the Extraction Engine.

Instead:

```text
Preset
 ↓
Hints
 ↓
Extraction Engine
 ↓
ExtractionResult
```

This ensures there is one canonical extraction implementation.

---

# 49. Preset and Capture

Presets may define capture defaults.

Example:

```json
{
  "capture": {
    "mode": "ELEMENT"
  }
}
```

This means:

```text
Capture Article
```

may be the preferred workflow.

The preset does not execute capture automatically.

---

# 50. Capture Defaults

Possible fields:

```text
mode
scale
target
```

MVP should keep this minimal.

Recommended:

```json
{
  "capture": {
    "mode": "ELEMENT"
  }
}
```

---

# 51. Preset Does Not Define Rendering

A preset must not contain:

```text
CSS rewriting
font injection
layout reconstruction
image editing
```

These belong to future rendering/composition systems.

---

# 52. Selector Types

MVP selectors should use CSS selectors.

Examples:

```text
article.article
.article-body
#newsletter
aside.sidebar
header.site-header
```

XPath is not required.

Arbitrary JavaScript selectors are forbidden.

---

# 53. Selector Safety

Preset selectors are treated as configuration data.

The system must never execute:

```text
eval()
new Function()
```

or any equivalent mechanism.

Selectors are passed only to safe DOM APIs.

---

# 54. Selector Specificity

Selectors should be as stable as practical.

Prefer:

```text
article.article
```

over:

```text
body > div:nth-child(4) > div:nth-child(2)
```

The preset editor may warn about fragile selectors.

---

# 55. Fragile Selector Detection

Potentially fragile selectors:

```text
:nth-child()
:nth-of-type()
deep anonymous hierarchy
generated CSS classes
```

The system may flag:

```text
Selector appears fragile.
```

but should not automatically reject it.

Some websites require structural selectors.

---

# 56. Stable Selector Preference

The system should prefer:

```text
ID
semantic class
data attributes
semantic elements
```

over:

```text
position-based selectors
```

Example priority:

```text
#article
article.article
[data-testid="article"]
article
div:nth-child(4)
```

---

# 57. Selector Generation

When the user saves a manually selected element into a preset, NewsClean may generate a selector.

The selector generator should prioritize stability.

Example:

```text
User selected:
<div class="article-body">
```

Generated:

```text
.article-body
```

rather than:

```text
body > div:nth-child(3) > main > div:nth-child(2)
```

---

# 58. Selector Uniqueness

Generated selectors should be tested:

```text
document.querySelectorAll(selector).length
```

For an expected unique target:

```text
count === 1
```

If not unique, the generator should improve specificity.

---

# 59. Selector Generator Fallback

Potential sequence:

```text
ID
 ↓
unique class
 ↓
data attribute
 ↓
semantic path
 ↓
structural path
```

The generated selector must remain valid CSS.

---

# 60. Preset Storage

MVP storage should be local.

Potential architecture:

```text
Chrome Storage
      ↓
Preset Repository
      ↓
Preset Resolver
```

The system does not require a backend.

---

# 61. Storage Contract

Conceptual:

```ts
interface PresetRepository {
  get(id: string): Promise<SitePreset | null>;
  save(preset: SitePreset): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<SitePreset[]>;
}
```

---

# 62. Storage Separation

Preset data should be separate from:

```text
session state
cleanup history
capture files
```

A preset is reusable configuration.

A session is temporary state.

---

# 63. Preset Lifecycle

```text
DISCOVER
   ↓
LOAD
   ↓
VALIDATE
   ↓
SUGGEST
   ↓
APPLY
   ↓
USE
   ↓
OPTIONAL UPDATE
```

---

# 64. Preset Resolver

The resolver determines which preset applies to the current URL.

Conceptual:

```ts
interface PresetResolver {
  resolve(url: string): Promise<SitePreset | null>;
}
```

Resolution must be deterministic.

---

# 65. Resolver Algorithm

Conceptually:

```text
Normalize URL
 ↓
Extract hostname
 ↓
Find exact hostname presets
 ↓
Evaluate path conditions
 ↓
Rank matches
 ↓
Return highest-specificity preset
```

---

# 66. Preset Conflict

If two presets have equal specificity:

```text
preset A
preset B
```

the resolver must not choose randomly.

Recommended priority:

```text
User-created
>
Imported
>
Built-in
```

if the user explicitly created a site-specific override.

---

# 67. User Override

The user should be able to override a built-in preset.

Example:

```text
Built-in:
example.com

User:
example.com
```

The user's preset should take precedence.

This allows newsroom-specific workflows.

---

# 68. Preset Inheritance

Preset inheritance is not required for MVP.

Avoid:

```text
Base preset
 ↓
Region preset
 ↓
User preset
 ↓
Department preset
```

until there is a demonstrated requirement.

Keeping presets flat reduces complexity.

---

# 69. Preset Imports

Future versions may support importing JSON presets.

Imported presets must be validated against the schema before storage.

Invalid files must be rejected.

---

# 70. Preset Exports

Users may eventually export:

```text
site-preset.json
```

for backup or sharing.

The export should contain configuration only.

It should not contain:

```text
article text
captured screenshots
browser cookies
session data
```

---

# 71. Preset Sharing

Future newsroom workflows may allow a shared preset repository.

Example:

```text
Creative Department
      ↓
Shared Site Presets
      ↓
All Workstations
```

This requires a separate synchronization architecture and is outside MVP.

---

# 72. Preset Update

When a preset is updated:

```text
version 1
↓
version 2
```

the system should preserve the previous version where practical.

At minimum, the new version must replace the active local configuration atomically.

---

# 73. Atomic Save

Preset updates should use:

```text
validate
 ↓
save
```

rather than:

```text
save partial
 ↓
validate
```

A broken preset must never become the active stored version.

---

# 74. Preset Rollback

Future versions should support:

```text
Rollback to version 1
```

This is useful if a site redesign breaks a newer preset.

---

# 75. Preset Diagnostics

Development mode should expose:

```text
Preset ID
Version
Hostname
Path Match
Rule Count
Extraction Hint Count
Validation Results
Health
```

---

# 76. Preset Test Harness

The architecture should allow a test harness to execute:

```text
Preset
+
Fixture HTML
```

and verify:

```text
Expected Article
Expected Title
Expected Body
Expected Cleanup Targets
```

This allows presets to be tested without opening Chrome.

---

# 77. Fixture-Based Testing

Example fixture:

```text
fixtures/
  example-news/
    article-01.html
    article-02.html
    redesign-01.html
```

The preset should pass known layouts and fail safely on unknown layouts.

---

# 78. Regression Testing

When a preset changes:

```text
Preset v2
```

the test suite should verify that:

```text
v1 behavior
```

has not been unintentionally broken unless explicitly intended.

---

# 79. Preset Test Result

Example:

```json
{
  "preset": "preset.example-news",
  "passed": true,
  "tests": [
    {
      "name": "article-container",
      "status": "PASS"
    },
    {
      "name": "title",
      "status": "PASS"
    },
    {
      "name": "body",
      "status": "PASS"
    },
    {
      "name": "advertisement-cleanup",
      "status": "PASS"
    }
  ]
}
```

---

# 80. Site Redesign Detection

A preset can become stale when:

```text
article selector fails
title selector fails
body selector fails
```

The system should detect this during validation.

It should not silently assume the preset still works.

---

# 81. Stale Preset UX

Example:

```text
Site preset needs review.

Example News changed its page structure.

3 of 8 rules still match.
```

Actions:

```text
Review
Disable
Edit Preset
Use Standard Extraction
```

---

# 82. Preset Auto-Repair

Automatic selector repair is outside MVP.

Future versions may suggest:

```text
Old:
.article-body

Possible replacement:
.story-content
```

The user must approve the change.

---

# 83. Preset Learning

NewsClean may eventually learn from repeated manual cleanup.

However, learning must be:

```text
explicit
reviewable
reversible
```

The system must not silently modify presets based on one accidental deletion.

---

# 84. Learning Workflow

Future:

```text
Repeated manual operation
        ↓
Pattern detected
        ↓
Suggested rule
        ↓
User approval
        ↓
Preset update
```

---

# 85. Preset Rule Provenance

Each rule should optionally record its origin:

```text
BUILT_IN
USER
IMPORTED
GENERATED
```

This helps determine trust and maintenance.

---

# 86. Preset Rule Statistics

Future diagnostics may show:

```text
.sidebar
Applied: 132 times
Successful: 129
No match: 3
```

This can help identify stale rules.

This is not required for MVP.

---

# 87. Preset Security

Because presets can contain selectors affecting page cleanup:

```text
Imported preset
```

must be treated as untrusted configuration.

The preset system must allow:

```text
CSS selectors
```

only.

It must never support arbitrary executable scripts.

---

# 88. No JavaScript Actions

This is a hard invariant.

A preset cannot contain:

```json
{
  "action": "javascript:..."
}
```

or:

```json
{
  "script": "..."
}
```

The preset schema must reject executable actions.

---

# 89. Preset Example

A complete minimal preset:

```json
{
  "schemaVersion": 1,
  "id": "preset.example-news",
  "version": 1,

  "site": {
    "hostname": "example.com"
  },

  "extraction": {
    "article": [
      "article.article"
    ],
    "title": [
      "h1.article-title"
    ],
    "heroImage": [
      ".article-hero img"
    ],
    "body": [
      ".article-body"
    ],
    "author": [
      ".article-author"
    ],
    "publicationDate": [
      "time[datetime]"
    ]
  },

  "cleanup": {
    "rules": [
      {
        "id": "ads",
        "category": "ADVERTISEMENT",
        "action": "DELETE",
        "selector": ".advertisement",
        "scope": "MATCHES",
        "enabled": true
      },
      {
        "id": "sidebar",
        "category": "SIDEBAR",
        "action": "DELETE",
        "selector": ".sidebar",
        "scope": "MATCHES",
        "enabled": true
      },
      {
        "id": "newsletter",
        "category": "NEWSLETTER",
        "action": "DELETE",
        "selector": ".newsletter",
        "scope": "MATCHES",
        "enabled": true
      }
    ]
  },

  "protection": {
    "rules": [
      {
        "id": "article",
        "selector": "article.article",
        "action": "KEEP"
      }
    ]
  },

  "capture": {
    "mode": "ELEMENT"
  },

  "metadata": {
    "name": "Example News",
    "author": "NewsClean"
  }
}
```

---

# 90. Preset Application Example

The newsroom workflow becomes:

```text
Open article
      ↓
NewsClean detects:
Example News preset
      ↓
Freeze
      ↓
Validate preset
      ↓
Article detected
      ↓
Cleanup proposal:
  Advertisement × 4
  Sidebar × 1
  Newsletter × 1
      ↓
User reviews
      ↓
Apply
      ↓
Capture Article
      ↓
PNG
```

---

# 91. Preset Application Result

Conceptual:

```json
{
  "preset": "preset.example-news",
  "status": "APPLIED",
  "extraction": {
    "article": "HIGH",
    "title": "HIGH",
    "body": "HIGH"
  },
  "cleanup": {
    "applied": 3,
    "skipped": 0,
    "stale": 1
  }
}
```

---

# 92. Preset State

Conceptual:

```ts
interface PresetState {
  activePreset: SitePreset | null;
  health: "HEALTHY" | "DEGRADED" | "STALE" | "BROKEN";
  validation: PresetValidationResult | null;
}
```

This state is session-level.

The stored preset remains independent.

---

# 93. Preset API

Conceptual:

```ts
interface SitePresetEngine {
  resolve(url: string): Promise<SitePreset | null>;

  validate(
    preset: SitePreset
  ): Promise<PresetValidationResult>;

  apply(
    preset: SitePreset
  ): Promise<PresetApplicationResult>;

  createFromSession(): Promise<SitePreset>;

  save(
    preset: SitePreset
  ): Promise<void>;
}
```

---

# 94. Internal Architecture

```text
                   CURRENT URL
                       │
                       ▼
                ┌──────────────┐
                │ PRESET       │
                │ RESOLVER     │
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ PRESET       │
                │ VALIDATOR    │
                └──────┬───────┘
                       ▼
                ┌──────────────┐
                │ PRESET       │
                │ INTERPRETER  │
                └──────┬───────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
      EXTRACTION HINTS      CLEANUP RULES
             │                   │
             ▼                   ▼
     EXTRACTION ENGINE      CLEANUP ENGINE
             │                   │
             └─────────┬─────────┘
                       ▼
                  WORKING DOM
                       │
                       ▼
                 CAPTURE ENGINE
```

---

# 95. Architectural Boundaries

The Preset System:

```text
DOES:
- Identify site configuration.
- Provide extraction hints.
- Provide cleanup rules.
- Provide protection rules.
- Provide capture defaults.
- Validate configuration.
- Resolve matching presets.

DOES NOT:
- Directly mutate DOM.
- Execute JavaScript.
- Capture screenshots.
- Encode PNG.
- Perform article cleanup itself.
- Replace Extraction Engine.
- Replace Cleanup Engine.
```

---

# 96. Acceptance Criteria

The Site Preset System is MVP-complete when:

```text
1. A preset can be associated with a hostname.
2. A preset can optionally match URL paths.
3. Presets have stable IDs and versions.
4. Presets can define extraction selectors.
5. Presets can define cleanup rules.
6. Presets can define protection rules.
7. Presets can define a capture default.
8. Presets are validated against the current DOM.
9. Invalid selectors do not break the page.
10. Stale rules are reported.
11. Optional stale rules do not invalidate the whole preset.
12. Required stale rules degrade the preset state.
13. Preset rules pass through Cleanup Engine.
14. Preset extraction hints pass through Extraction Engine.
15. User actions override preset actions.
16. Presets cannot execute arbitrary JavaScript.
17. Presets are stored locally.
18. Presets can be versioned.
19. Built-in and user-created presets are distinguishable.
20. Preset matching is deterministic.
21. A fallback to standard extraction is available.
22. A preset can be tested against the current page.
23. Preset application does not directly manipulate the DOM.
```

---

# 97. Architectural Invariants

The following rules are mandatory:

```text
1. Presets are configuration, not executable code.
2. Presets never directly mutate the DOM.
3. All cleanup actions pass through Cleanup Engine.
4. All extraction hints pass through Extraction Engine.
5. Current DOM state is authoritative.
6. User intent overrides preset intent.
7. Invalid selectors fail safely.
8. Zero-match optional rules do not invalidate a preset.
9. Required selector failures produce degraded/stale state.
10. Presets must be versioned.
11. Preset matching must be deterministic.
12. Site presets are site-specific.
13. Global cleanup belongs to Smart Cleanup.
14. Presets remain local in MVP.
15. Presets must not contain JavaScript.
16. Presets must not contain article content.
17. Presets must not contain captured images.
18. Presets must not contain session state.
19. Preset application must be reversible through existing Cleanup history.
20. Presets accelerate the workflow; they never remove editorial control.
```

---

# 98. Final Product Position

The Preset System completes the transition from a generic webpage cleaning tool to a newsroom-oriented production tool.

Without presets:

```text
OPEN
→ FREEZE
→ INSPECT
→ CLEAN
→ CAPTURE
```

With presets:

```text
OPEN
→ FREEZE
→ PRESET
→ REVIEW
→ CAPTURE
```

The important architectural point is that the shortcut does not bypass the existing system.

It simply provides known configuration to the existing engines:

```text
                    SITE PRESET
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
        Extraction    Cleanup     Capture
           Hints       Rules      Default
             │           │           │
             ▼           ▼           ▼
        EXTRACTION    CLEANUP     CAPTURE
```

Thus the Preset System remains an orchestration/configuration layer rather than becoming another independent processing engine.

---

# 99. Next Document

The next document is:

`10-EXPORT-ENGINE.md` — Export & File Delivery

It will define the final delivery layer after PNG generation:

```text
PNG Blob
→ Filename Generation
→ Download
→ Save As
→ File System Access
→ Clipboard
→ Export History
→ Naming Rules
→ File Validation
→ Error Recovery
```

This will complete the initial production pipeline:

```text
WEB PAGE
→ FREEZE
→ EXTRACT
→ INSPECT
→ CLEAN
→ PRESET
→ CAPTURE
→ EXPORT
```
