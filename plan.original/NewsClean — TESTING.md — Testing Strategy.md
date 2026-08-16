# NewsClean

## Testing Strategy

**Document ID:** `13-TESTING`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`, `10-UI-UX.md`, `11-DATA-MODEL.md`, `12-SECURITY.md`

---

## 1. Purpose

This document defines the testing strategy for NewsClean.

NewsClean interacts directly with arbitrary webpages, browser APIs, asynchronous operations, DOM mutation, page rendering, and PNG generation.

Testing therefore cannot rely only on conventional unit tests.

The test architecture must verify five dimensions simultaneously:

```text
Correctness
Browser compatibility
DOM safety
Visual correctness
Operational reliability
```

The central principle is:

> **The core engines must be testable without Chrome, while browser integration and capture behavior must be validated inside a real Chromium environment.**

---

# 2. Testing Philosophy

NewsClean should use a layered testing strategy:

```text
                    E2E
                     ▲
                     │
              Integration
                     ▲
                     │
                 Component
                     ▲
                     │
                   Unit
                     ▲
                     │
              Static Analysis
```

Each layer answers a different question.

```text
Unit
→ Is the algorithm correct?

Integration
→ Do the engines communicate correctly?

Browser
→ Does Chrome behave as expected?

E2E
→ Can an operator actually complete the workflow?

Visual
→ Does the resulting PNG look correct?

Security
→ Can hostile input break the extension?
```

---

# 3. Testing Objectives

The test system must guarantee that NewsClean:

```text
1. Freezes supported pages reliably.
2. Correctly identifies DOM elements.
3. Deletes only intended elements.
4. Restores deleted elements through Undo.
5. Applies presets deterministically.
6. Does not execute preset/page-controlled code.
7. Extracts article structure correctly.
8. Produces clean PNG output.
9. Does not capture NewsClean UI.
10. Survives malformed webpages.
11. Isolates browser tabs and sessions.
12. Handles navigation races.
13. Handles asynchronous failures.
14. Does not leak article content.
15. Remains usable on real news websites.
```

---

# 4. Test Pyramid

Recommended target distribution:

```text
             ┌───────────────┐
             │   E2E / UI    │
             │     10%       │
             ├───────────────┤
             │ Integration   │
             │     20%       │
             ├───────────────┤
             │    Unit       │
             │     55%       │
             ├───────────────┤
             │ Static/Security│
             │     15%       │
             └───────────────┘
```

The exact percentages are targets rather than hard constraints.

The important rule is:

> Most logic must be tested without launching Chrome.

---

# 5. Test Layers

NewsClean uses the following test layers:

```text
L0 Static Analysis
L1 Unit Tests
L2 Component Tests
L3 Engine Integration Tests
L4 Browser Integration Tests
L5 End-to-End Tests
L6 Visual Regression Tests
L7 Security Tests
L8 Performance Tests
L9 Real-Site Compatibility Tests
```

---

# 6. L0 — Static Analysis

Every CI run should perform:

```text
TypeScript type checking
ESLint
Build
Schema validation
Dependency checks
```

Recommended baseline:

```bash
npm run typecheck
npm run lint
npm run build
```

No production build should be accepted if type checking fails.

---

# 7. Type Safety

The codebase should use strict TypeScript configuration.

Recommended:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

The exact configuration may be adjusted during implementation, but the architecture requires strict typing.

---

# 8. Zero Any Policy

NewsClean should follow:

```text
No implicit any
No unnecessary explicit any
No unsafe casts
```

The domain model defined in `11-DATA-MODEL.md` should remain strongly typed.

---

# 9. Lint Rules

Linting should detect:

```text
unused variables
unsafe casts
dangerous DOM APIs
unhandled promises
security anti-patterns
```

Where practical, custom lint rules should flag:

```text
eval()
new Function()
innerHTML
document.write()
```

inside extension code.

---

# 10. Build Test

The production build must be tested as an actual Chrome extension artifact.

The test must verify:

```text
manifest.json
service worker
content scripts
extension UI
assets
CSP
```

are all present.

---

# 11. Manifest Validation

CI should validate:

```text
manifest_version = 3
permissions
host_permissions
content_scripts
background
action
CSP
web_accessible_resources
```

against architectural requirements.

---

# 12. Unit Testing

Unit tests are the primary test mechanism for pure logic.

Unit-testable modules should include:

```text
SelectorGenerator
SelectorValidator
ElementReference
PresetMatcher
PresetValidator
PresetMigrator
ExtractionScorer
CleanupPlanner
CleanupHistory
CommandValidator
MessageValidator
FilenameSanitizer
CaptureGeometry
SessionManager
```

---

# 13. Pure Functions First

Whenever possible, algorithms should be implemented as pure functions.

Example:

```text
Input
+
Configuration
↓
Output
```

rather than:

```text
Input
↓
global state
↓
DOM
↓
storage
↓
random result
```

This makes testing deterministic.

---

# 14. Element Reference Tests

Tests must verify:

```text
selector generation
selector resolution
invalid selector handling
stale references
duplicate selectors
special characters
```

Example:

```text
DOM
<div id="article">
```

should produce a stable usable reference.

---

# 15. Special Character Tests

The Inspector must handle:

```text
class="news-item"
class="news:item"
class="123article"
id="foo/bar"
id="العنوان"
```

without producing invalid selectors.

---

# 16. Selector Validation Tests

Given:

```text
.article
```

expect:

```text
VALID
```

Given:

```text
.article[
```

expect:

```text
INVALID_SELECTOR
```

The system must never crash.

---

# 17. Selector Collision Tests

Two different elements may produce similar selectors.

Tests should verify that:

```text
selector
+
context
```

does not accidentally target the wrong element.

---

# 18. Stale Reference Tests

Scenario:

```text
1. Select .sidebar.
2. Remove .sidebar externally.
3. Execute DELETE.
```

Expected:

```text
TARGET_NOT_FOUND
```

not:

```text
delete another element
```

---

# 19. DOM Inspector Tests

Inspector tests must verify:

```text
hover detection
selection
parent selection
child selection
selector display
breadcrumb generation
element metadata
```

---

# 20. Inspector Isolation

The Inspector must never select its own UI.

Given:

```text
NewsClean Toolbar
+
Page DOM
```

hovering the toolbar should not produce:

```text
DIV#newsclean-root
```

as the selected page target.

---

# 21. Overlay Tests

Verify:

```text
overlay position
scroll synchronization
viewport boundaries
resize synchronization
selection state
hover state
```

---

# 22. Overlay Boundary Tests

Given a target near:

```text
top
bottom
left
right
```

the contextual toolbar must remain visible.

---

# 23. Cleanup Engine Tests

The Cleanup Engine is a critical unit-test target.

Test:

```text
DELETE
HIDE
KEEP
BATCH DELETE
UNDO
REDO
RESET
```

independently.

---

# 24. Delete Test

Given:

```html
<div class="ad"></div>
<article>Content</article>
```

execute:

```text
DELETE .ad
```

Expected:

```text
.ad removed
article preserved
```

---

# 25. Hide Test

Expected:

```text
DOM node remains
visual representation disappears
```

The test must distinguish:

```text
DELETE
```

from:

```text
HIDE
```

---

# 26. Keep Test

Expected:

```text
element remains
protection state recorded
```

A subsequent automated cleanup operation must respect the Keep rule.

---

# 27. Protected Element Test

Scenario:

```text
KEEP article
SMART CLEANUP
```

Expected:

```text
article remains untouched
```

This is a mandatory regression test.

---

# 28. Batch Cleanup Test

Given:

```html
<div class="ad"></div>
<div class="ad"></div>
<div class="ad"></div>
```

Delete Similar should create:

```text
1 logical history operation
3 affected elements
```

Undo must restore all three.

---

# 29. Undo Test

Sequence:

```text
DELETE A
UNDO
```

Expected:

```text
A restored
```

---

# 30. Redo Test

Sequence:

```text
DELETE A
UNDO
REDO
```

Expected:

```text
A deleted
```

---

# 31. Redo Invalidation

Sequence:

```text
DELETE A
UNDO
DELETE B
```

Expected:

```text
REDO stack empty
```

---

# 32. Reset Test

Sequence:

```text
DELETE A
HIDE B
KEEP C
RESET
```

Expected:

```text
A restored
B restored
C protection removed
```

The exact Keep semantics must match `06-CLEANUP-ENGINE.md`.

---

# 33. Cleanup Idempotency

Applying the same cleanup rule twice should not produce undefined behavior.

Example:

```text
DELETE .ad
DELETE .ad
```

Expected:

```text
second operation
→ no target
or
→ safely ignored
```

depending on the defined command semantics.

---

# 34. Extraction Engine Testing

Article extraction must be tested against multiple DOM structures.

Minimum fixture categories:

```text
standard article
article with sidebar
article with ads
article with newsletter
article with related content
article with hero image
article without hero image
article with subtitle
article without subtitle
article with author
article with no author
```

---

# 35. Extraction Fixture Architecture

Fixtures should be stored as:

```text
tests/
└── fixtures/
    └── extraction/
        ├── simple/
        ├── complex/
        ├── noisy/
        ├── malformed/
        └── international/
```

Each fixture should have:

```text
HTML
expected structure
expected confidence
```

---

# 36. Extraction Golden Tests

For each fixture:

```text
HTML
 ↓
Extraction Engine
 ↓
ExtractionResult
 ↓
Expected Result
```

The comparison should focus on semantic fields rather than fragile DOM serialization.

---

# 37. Extraction Regression

If a change causes:

```text
HIGH confidence
→ LOW confidence
```

on a known fixture, CI should fail unless the fixture is intentionally updated.

---

# 38. Extraction False Positive Tests

The system must test that it does not incorrectly identify:

```text
sidebar
related article
advertisement
comment section
newsletter
```

as the primary article.

---

# 39. Extraction False Negative Tests

The system must also test that it can identify articles where:

```text
article
```

is not a simple `<article>` element.

---

# 40. Preset Tests

Preset testing includes:

```text
matching
validation
application
migration
staleness
partial application
conflicts
```

---

# 41. Preset Matching Test

Given:

```text
hostname = example.com
path = /news/article
```

and:

```text
preset = example.com /news/*
```

Expected:

```text
MATCH
```

---

# 42. Preset Non-Matching Test

Given:

```text
example.com/sports
```

Expected:

```text
NO_MATCH
```

if preset applies only to:

```text
/news/*
```

---

# 43. Preset Validation Test

Given:

```text
selector = .article-body
matchCount = 1
required = true
```

Expected:

```text
PASS
```

---

# 44. Stale Preset Test

Given:

```text
required selector
matchCount = 0
```

Expected:

```text
STALE
```

or the defined degraded state.

---

# 45. Partial Preset Test

Given:

```text
title selector → 1 match
body selector → 1 match
hero selector → 0 matches
```

Expected:

```text
PARTIAL
```

not:

```text
FAILED
```

unless the missing hero is marked required.

---

# 46. Preset Security Tests

Every imported preset test suite must include:

```text
script field
function field
eval field
unknown action
invalid selector
prototype pollution attempt
oversized object
invalid schema version
```

All must be rejected safely.

---

# 47. Prototype Pollution Test

Test malicious JSON such as:

```json
{
  "__proto__": {
    "isAdmin": true
  }
}
```

The parser/validator must not alter application prototypes.

---

# 48. Oversized Preset Test

A malicious or accidental preset containing extremely large arrays should be rejected or bounded.

Example:

```text
100,000 selectors
```

must not freeze the extension.

---

# 49. Preset Migration Tests

For every schema version:

```text
v1
 ↓
migration
 ↓
current model
```

must produce a valid current object.

---

# 50. Freeze Engine Tests

Freeze testing must distinguish:

```text
DOM freeze
visual freeze
animation freeze
network stabilization
capture readiness
```

The engine should expose measurable state.

---

# 51. Freeze State Test

Given a stable page:

```text
FREEZE
```

Expected:

```text
FROZEN
```

within the defined timeout.

---

# 52. Freeze Failure Test

Given a deliberately unstable page:

```text
continuous DOM mutations
```

Expected:

```text
DEGRADED
```

or:

```text
FAILED
```

according to the freeze strategy.

The engine must not claim:

```text
FROZEN
```

when the page is demonstrably still changing.

---

# 53. Freeze Idempotency

Sequence:

```text
FREEZE
FREEZE
```

must not produce multiple conflicting freeze layers.

Expected:

```text
already frozen
```

or an equivalent safe state.

---

# 54. Unfreeze Test

If unfreeze is supported:

```text
FREEZE
UNFREEZE
```

must restore the page's relevant runtime behavior.

The extension's own cleanup modifications should not be confused with the freeze state.

---

# 55. Animation Test

Fixture:

```css
.element {
  animation: move 1s infinite;
}
```

After freeze:

```text
computed visual state
```

should remain stable according to the defined Freeze Engine strategy.

---

# 56. Transition Test

Fixture:

```css
transition: transform 500ms;
```

The capture process must not accidentally capture an intermediate transition state.

---

# 57. Mutation Test

Fixture:

```js
setInterval(() => {
  element.textContent = Date.now();
}, 50);
```

The freeze system must detect or stabilize this behavior according to its implementation contract.

---

# 58. Capture Engine Testing

Capture is one of the most difficult parts of the system and requires both unit and browser-level tests.

---

# 59. Capture Unit Tests

Test:

```text
target geometry
scale calculation
viewport calculation
segment calculation
stitching geometry
filename generation
dimension validation
```

---

# 60. Capture Geometry

Given:

```text
viewport = 1280 × 900
target = 100 × 100 × 800 × 2000
```

the engine should calculate the correct capture region.

---

# 61. High DPI Test

Given:

```text
devicePixelRatio = 2
```

the engine must correctly distinguish:

```text
CSS pixels
```

from:

```text
output pixels
```

---

# 62. Full-Page Segmentation

If full-page capture requires segmentation:

```text
segment 1
segment 2
segment 3
...
```

the engine must calculate:

```text
no overlap
or controlled overlap
```

according to the stitching strategy.

---

# 63. Stitching Test

Synthetic images should verify:

```text
segment 1
+
segment 2
+
segment 3
```

produce the correct final dimensions and ordering.

---

# 64. Capture Output Test

For every capture fixture:

```text
PNG
→ decode
→ validate dimensions
→ validate PNG signature
```

The PNG must be a valid image.

---

# 65. PNG Signature

The output must begin with the valid PNG signature:

```text
89 50 4E 47 0D 0A 1A 0A
```

This is a basic corruption check.

---

# 66. Capture UI Exclusion Test

A browser test must verify:

```text
NewsClean toolbar
```

does not appear in the final PNG.

This is a mandatory E2E test.

---

# 67. Inspector Overlay Exclusion

Likewise:

```text
selection outline
hover outline
context menu
```

must not appear in the final capture.

---

# 68. Hidden Element Capture Test

Given:

```text
Hide advertisement
Capture
```

Expected:

```text
advertisement absent
```

from the PNG.

---

# 69. Deleted Element Capture Test

Given:

```text
Delete sidebar
Capture
```

Expected:

```text
sidebar absent
```

from the PNG.

---

# 70. Kept Element Capture Test

Given:

```text
KEEP article image
SMART CLEANUP
Capture
```

Expected:

```text
image remains
```

---

# 71. Browser Integration Testing

Browser integration tests must use a real Chromium environment.

Recommended:

```text
Playwright
```

because it can:

```text
launch Chromium
load extension
create tabs
navigate pages
interact with DOM
capture screenshots
```

---

# 72. Extension Test Harness

A dedicated fixture extension environment should be created.

Conceptually:

```text
tests/
└── browser/
    ├── extension/
    ├── fixtures/
    ├── pages/
    └── specs/
```

---

# 73. Local Test Pages

Do not use real news websites as the primary deterministic test environment.

Instead build controlled pages:

```text
tests/pages/
├── basic-article.html
├── noisy-article.html
├── dynamic-article.html
├── malicious-article.html
├── long-article.html
├── iframe-article.html
└── malformed-article.html
```

---

# 74. Basic Article Fixture

Should contain:

```text
header
logo
title
subtitle
hero image
body
author
date
sidebar
advertisement
footer
```

This becomes the primary end-to-end fixture.

---

# 75. Noisy Article Fixture

Include:

```text
multiple ads
newsletter
social widgets
related articles
sticky banner
cookie banner
video
sidebar
```

Expected output:

```text
clean article
```

---

# 76. Dynamic Article Fixture

Include:

```text
setInterval
MutationObserver
lazy content
animated elements
```

Used to test Freeze Engine behavior.

---

# 77. Malicious Article Fixture

Include DOM strings such as:

```text
<script>
<img onerror>
svg event attributes
malicious class names
malicious IDs
```

No payload should execute in the NewsClean UI.

---

# 78. Long Article Fixture

Create an article sufficiently long to require:

```text
multiple capture segments
```

This becomes the canonical full-page capture test.

---

# 79. International Fixture

The test suite should include:

```text
Arabic
French
English
```

article content.

This is particularly important because NewsClean is intended for newsroom workflows.

---

# 80. RTL Fixture

An Arabic article should include:

```html
<html dir="rtl">
```

and verify:

```text
article extraction
inspection
cleanup
capture
```

remain correct.

---

# 81. Browser Test Lifecycle

Each browser test should follow:

```text
Launch Chromium
 ↓
Load extension
 ↓
Open fixture page
 ↓
Create session
 ↓
Perform workflow
 ↓
Assert state
 ↓
Capture output if required
 ↓
Close context
```

---

# 82. Extension Loading

The test runner must load the built extension rather than an arbitrary source directory when validating production behavior.

This catches:

```text
manifest errors
build errors
missing assets
CSP issues
```

---

# 83. E2E Test 01 — Launch

Scenario:

```text
Open supported article
Activate NewsClean
```

Expected:

```text
toolbar visible
session active
page remains visually unchanged
```

---

# 84. E2E Test 02 — Freeze

Scenario:

```text
Activate
Freeze
```

Expected:

```text
status = FROZEN
```

and the fixture page becomes stable.

---

# 85. E2E Test 03 — Inspect

Scenario:

```text
Freeze
Inspect
Hover article title
Click title
```

Expected:

```text
title selected
context actions visible
```

---

# 86. E2E Test 04 — Delete

Scenario:

```text
Select advertisement
Delete
```

Expected:

```text
advertisement removed
cleanup counter = 1
```

---

# 87. E2E Test 05 — Undo

Scenario:

```text
Delete
Undo
```

Expected:

```text
advertisement restored
```

---

# 88. E2E Test 06 — Redo

Scenario:

```text
Delete
Undo
Redo
```

Expected:

```text
advertisement removed
```

---

# 89. E2E Test 07 — Delete Similar

Scenario:

```text
Select .advertisement
Delete Similar
```

Expected:

```text
all matching advertisements removed
```

and:

```text
one logical history operation
```

---

# 90. E2E Test 08 — Preset

Scenario:

```text
Open example fixture
Preset detected
Review
Apply
```

Expected:

```text
defined noise removed
article preserved
```

---

# 91. E2E Test 09 — Manual Override

Scenario:

```text
Preset applied
Inspect
Delete additional element
```

Expected:

```text
preset changes remain
manual cleanup applied
```

---

# 92. E2E Test 10 — Keep

Scenario:

```text
KEEP hero image
Apply smart cleanup
```

Expected:

```text
hero image remains
```

---

# 93. E2E Test 11 — Capture Visible

Scenario:

```text
Clean page
Capture
Visible
```

Expected:

```text
PNG created
dimensions valid
NewsClean UI absent
```

---

# 94. E2E Test 12 — Capture Element

Scenario:

```text
Select article
Capture Element
```

Expected:

```text
PNG contains article region
```

---

# 95. E2E Test 13 — Full Page

Scenario:

```text
Clean
Capture Full Page
```

Expected:

```text
PNG height corresponds to complete page
segments correctly stitched
```

---

# 96. E2E Test 14 — Navigation

Scenario:

```text
Open article A
Select element
Navigate to article B
```

Expected:

```text
Session A destroyed
Session B created
No stale reference operation
```

---

# 97. E2E Test 15 — Multi-Tab

Scenario:

```text
Tab A → article A
Tab B → article B

Delete in A
```

Expected:

```text
B unchanged
```

---

# 98. E2E Test 16 — Malicious DOM

Scenario:

```text
Open malicious fixture
Inspect malicious element
```

Expected:

```text
no script execution
no UI injection
no extension crash
```

---

# 99. E2E Test 17 — Invalid Preset

Scenario:

```text
Import malformed preset
```

Expected:

```text
rejected
```

and:

```text
existing presets unaffected
```

---

# 100. E2E Test 18 — Unsupported Page

Scenario:

```text
Open unsupported browser page
```

Expected:

```text
NewsClean unavailable
```

without extension errors.

---

# 101. Visual Regression Testing

Visual testing is essential because the product's output is a PNG.

The test system should maintain golden screenshots.

---

# 102. Visual Test Types

Two separate visual systems are required:

```text
A. Extension UI visual regression
B. Captured article visual regression
```

They should not be mixed.

---

# 103. UI Golden Screenshots

Test:

```text
toolbar
inspect mode
selected element
preset panel
capture panel
error state
RTL UI
```

---

# 104. Article Capture Golden

Given deterministic HTML fixture:

```text
HTML
+
CSS
+
assets
```

capture the expected PNG.

Compare:

```text
actual PNG
vs
golden PNG
```

---

# 105. Pixel Comparison

A visual comparison should define a controlled tolerance.

Do not require:

```text
100% pixel equality
```

when browser rendering differences make this unrealistic.

Use a documented threshold.

---

# 106. Perceptual Comparison

For browser-generated PNGs, a perceptual comparison may be preferable.

Possible metrics:

```text
pixel diff
SSIM
perceptual hash
```

The chosen method should be standardized before CI enforcement.

---

# 107. Golden Asset Versioning

Golden images should live in:

```text
tests/
└── visual/
    ├── ui/
    └── captures/
```

They must be versioned with the code.

---

# 108. Golden Update Policy

Updating a golden screenshot must require explicit developer intent.

Example:

```bash
npm run test:visual:update
```

should not run automatically in CI.

---

# 109. Visual Failure Output

When a visual test fails, CI should produce:

```text
expected.png
actual.png
diff.png
```

This allows rapid diagnosis.

---

# 110. Security Testing

Security tests are first-class tests, not an optional final audit.

The suite must cover:

```text
XSS
selector injection
preset injection
message injection
prototype pollution
permission misuse
unsafe DOM APIs
filename injection
session isolation
```

---

# 111. Static Security Tests

CI should fail if production code contains prohibited constructs.

At minimum:

```text
eval(
new Function(
document.write(
```

Additional review should cover unsafe:

```text
innerHTML
outerHTML
insertAdjacentHTML
```

---

# 112. DOM XSS Test

Test that:

```text
page-controlled string
```

never becomes:

```text
executable NewsClean markup
```

---

# 113. Message Fuzzing

The message validator should receive random malformed payloads.

Examples:

```text
null
undefined
[]
{}
huge string
huge object
wrong types
unknown commands
missing session
```

Expected:

```text
reject safely
```

---

# 114. Preset Fuzzing

Preset parser should be tested with malformed JSON structures.

Potential cases:

```text
deep nesting
huge arrays
null values
wrong primitive types
unexpected fields
invalid selectors
invalid actions
```

---

# 115. Selector Fuzzing

Generate unusual selectors from:

```text
unicode
quotes
brackets
slashes
colons
spaces
escaped characters
```

The Selector Engine must never crash.

---

# 116. Mutation Fuzzing

The Cleanup Engine should be tested against rapidly changing DOMs.

Example:

```text
element exists
↓
external mutation
↓
element replaced
↓
cleanup command
```

Expected:

```text
safe failure
```

rather than mutation of an unintended target.

---

# 117. Performance Testing

Performance matters because news pages can contain thousands of DOM nodes.

---

# 118. DOM Size Benchmarks

Create fixtures with:

```text
1,000 nodes
5,000 nodes
10,000 nodes
25,000 nodes
50,000 nodes
```

Measure:

```text
Inspector startup
Freeze
Extraction
Preset validation
Cleanup
Capture preparation
```

---

# 119. Performance Budget

Initial target:

```text
Toolbar activation
< 100 ms

Simple inspection
< 16 ms per interaction frame

Basic selector operation
< 50 ms

Preset validation
< 250 ms

Simple extraction
< 500 ms
```

These are engineering targets, not guarantees.

Real-world page complexity may require adaptive behavior.

---

# 120. Inspector Performance

Hovering over the page must not trigger a full DOM traversal on every mouse event.

Benchmark:

```text
mousemove
→ elementFromPoint
→ overlay update
```

rather than:

```text
mousemove
→ entire DOM scan
```

---

# 121. Cleanup Performance

Deleting an element should normally be:

```text
O(1)
```

relative to the number of unrelated page elements.

Selector-wide operations are naturally proportional to:

```text
number of matches
```

and must be benchmarked accordingly.

---

# 122. Extraction Performance

Extraction should avoid unnecessary repeated:

```text
querySelectorAll
```

across the entire DOM.

Candidate discovery should be bounded and prioritized.

---

# 123. Capture Performance

Measure:

```text
prepare
render
segment
stitch
encode
export
```

separately.

This identifies bottlenecks.

---

# 124. Memory Testing

Large captures can create large bitmaps.

Tests must detect:

```text
memory spikes
Blob retention
ImageBitmap leaks
canvas retention
```

---

# 125. Capture Memory Test

Scenario:

```text
Capture 20 large articles sequentially
```

Expected:

```text
memory returns toward baseline
```

after each capture.

---

# 126. Long-Running Session Test

Run:

```text
inspect
delete
undo
redo
preset
capture
repeat
```

for a prolonged period.

The extension should not exhibit unbounded memory growth.

---

# 127. Browser Compatibility

MVP targets:

```text
Google Chrome
Chromium-based browsers where Manifest V3 behavior is compatible
```

Primary CI target:

```text
Chromium
```

---

# 128. Real-World Site Compatibility

Synthetic fixtures are necessary but insufficient.

A controlled set of real news websites should be used for compatibility testing.

The test list should contain representative site architectures:

```text
traditional CMS
React
Next.js
Vue
WordPress
custom newsroom CMS
heavy advertising
video-heavy
RTL
French
Arabic
```

---

# 129. Real-Site Testing Policy

Real websites should not become mandatory CI dependencies.

Reason:

```text
site changes
network failures
geo restrictions
anti-bot
rate limits
```

Instead:

```text
scheduled compatibility suite
```

can run separately.

---

# 130. Real-Site Fixtures

When possible, capture deterministic snapshots of page structures for regression tests rather than depending permanently on live sites.

This creates:

```text
real-world origin
+
deterministic test environment
```

---

# 131. Network Isolation

Most automated tests should not require the public internet.

Use:

```text
local fixture server
```

for:

```text
HTML
CSS
images
JavaScript
```

---

# 132. Deterministic Assets

Capture tests must use deterministic assets.

Avoid external:

```text
fonts
images
videos
analytics
```

because they can change rendering.

---

# 133. Time Determinism

Dynamic pages should use controlled clocks where possible.

Avoid test assertions based on:

```text
Date.now()
```

unless time is explicitly mocked or controlled.

---

# 134. Randomness

Tests must not depend on uncontrolled randomness.

If IDs are random:

```text
mock ID generator
```

for deterministic unit tests.

---

# 135. Test Data Factories

Create factories for:

```text
PageContext
ElementReference
CleanupOperation
SitePreset
ExtractionResult
CaptureResult
```

Example:

```text
createElementReference()
createPreset()
createCleanupOperation()
```

This prevents test code from duplicating fragile object literals.

---

# 136. Test Naming

Tests should describe behavior.

Good:

```text
deletes only the selected advertisement
```

Bad:

```text
testDelete1
```

---

# 137. Test Organization

Recommended:

```text
tests/
├── unit/
│   ├── cleanup/
│   ├── extraction/
│   ├── presets/
│   ├── messaging/
│   ├── security/
│   └── capture/
│
├── integration/
│   ├── cleanup/
│   ├── extraction/
│   ├── presets/
│   └── session/
│
├── browser/
│   ├── fixtures/
│   ├── specs/
│   └── extension/
│
├── visual/
│   ├── ui/
│   └── captures/
│
└── performance/
```

---

# 138. Test Naming Convention

Recommended:

```text
*.test.ts
```

for unit/integration tests.

```text
*.spec.ts
```

for browser/E2E tests.

---

# 139. Test Commands

Recommended scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:visual": "playwright test tests/visual",
  "test:security": "vitest run tests/security",
  "test:performance": "vitest run tests/performance"
}
```

Exact tooling may change during implementation.

---

# 140. Coverage

Coverage should be measured, but coverage percentage must not become the sole quality metric.

Recommended initial targets:

```text
Domain logic:       ≥ 90%
Utilities:          ≥ 90%
Engine logic:       ≥ 85%
Messaging:          ≥ 90%
Security validators: ≥ 95%
UI components:      ≥ 75%
```

The highest priority is behavioral coverage of critical paths.

---

# 141. Critical Path Coverage

The following paths must have E2E coverage:

```text
Open
→ Freeze
→ Inspect
→ Delete
→ Undo
→ Capture
```

and:

```text
Open
→ Freeze
→ Preset
→ Apply
→ Capture
```

---

# 142. Negative Path Coverage

Must also test:

```text
Freeze fails
Extraction fails
Preset invalid
Selector invalid
Element disappears
Capture fails
Download fails
Navigation occurs
Tab closes
```

---

# 143. Failure Injection

The architecture should allow controlled failure injection.

Examples:

```text
mock storage failure
mock capture failure
mock selector failure
mock stale reference
mock message timeout
```

This tests recovery paths without requiring real browser failures.

---

# 144. Timeout Testing

Every asynchronous engine should have timeout tests.

Example:

```text
Capture
→ never completes
```

Expected:

```text
CAPTURE_TIMEOUT
```

rather than an indefinitely pending promise.

---

# 145. Cancellation Testing

Scenario:

```text
Capture starts
↓
Cancel
```

Expected:

```text
CAPTURE_CANCELLED
```

and:

```text
temporary resources released
```

---

# 146. Concurrency Testing

The system should test:

```text
capture + navigation
cleanup + preset application
inspection + navigation
preset validation + session close
```

to detect race conditions.

---

# 147. Command Ordering

The command system should test invalid sequences.

Example:

```text
CAPTURE
```

before:

```text
FREEZE
```

Expected:

```text
NOT_FROZEN
```

if the capture contract requires freezing.

---

# 148. State Machine Testing

The Session state machine should be tested for invalid transitions.

Example:

```text
CAPTURING
→ INSPECTING
```

must either:

```text
reject
```

or:

```text
cancel capture first
```

according to the defined state machine.

---

# 149. Property-Based Testing

Property-based testing should be considered for:

```text
selector generation
filename sanitization
preset validation
history operations
geometry calculations
```

Example property:

```text
sanitizeFilename(input)
```

must never return a path separator.

---

# 150. History Property

For any valid cleanup operation:

```text
apply
→ undo
```

should restore the logical pre-operation state.

And:

```text
apply
→ undo
→ redo
```

should reproduce the post-operation state.

---

# 151. Capture Property

For valid dimensions:

```text
width > 0
height > 0
scale > 0
```

the capture geometry must never produce:

```text
negative width
negative height
NaN
Infinity
```

---

# 152. Security Property

For any arbitrary page-controlled string:

```text
renderAsNewsCleanUI(string)
```

must not execute it as code.

---

# 153. Fuzzing Boundary

The fuzzing system should focus on input boundaries:

```text
HTML
selectors
JSON presets
messages
filenames
URLs
class names
IDs
text content
```

---

# 154. Accessibility Testing

UI tests should verify:

```text
keyboard navigation
focus
ARIA labels
button names
modal focus
RTL layout
contrast
```

Automated accessibility tooling may be integrated into Playwright.

---

# 155. Keyboard E2E

Critical workflow must be possible using keyboard:

```text
Freeze
Inspect
Delete
Undo
Capture
```

where shortcuts are defined.

---

# 156. RTL E2E

The Arabic interface must be tested for:

```text
toolbar order
context menus
dialogs
text alignment
icons
keyboard behavior
```

---

# 157. Test Environment Matrix

Initial CI matrix:

```text
Node.js
→ supported LTS version

Chromium
→ current stable
```

Nightly or scheduled:

```text
Chromium beta
```

where practical.

---

# 158. CI Pipeline

Recommended pipeline:

```text
PUSH
 │
 ├── Typecheck
 │
 ├── Lint
 │
 ├── Unit
 │
 ├── Security
 │
 ├── Build
 │
 ├── Integration
 │
 └── E2E
       │
       └── Visual
```

---

# 159. Fast CI

Pull requests should run:

```text
typecheck
lint
unit
security
build
critical E2E
```

---

# 160. Full CI

Main branch should additionally run:

```text
full E2E
visual
performance smoke tests
```

---

# 161. Nightly CI

Nightly tests may include:

```text
large DOM
long capture
memory
extended workflows
real-site compatibility
Chromium beta
```

---

# 162. Release Gate

A release cannot be produced when:

```text
critical unit tests fail
critical E2E fails
security tests fail
build fails
manifest validation fails
visual regression is unexplained
```

---

# 163. Flaky Test Policy

Flaky tests must not simply be retried indefinitely.

A flaky test should be:

```text
identified
isolated
diagnosed
fixed
```

Retries may hide real browser race conditions.

---

# 164. Test Isolation

Each test should receive:

```text
fresh browser context
fresh session
fresh fixture state
```

where practical.

---

# 165. Cleanup After Test

Tests must clean:

```text
browser context
temporary files
generated PNGs
storage
local fixtures
```

---

# 166. Snapshot Testing

Snapshot tests may be used for:

```text
domain objects
message schemas
preset normalization
```

but should not replace behavioral tests.

---

# 167. Snapshot Anti-Pattern

Do not snapshot the entire DOM after every operation.

This produces fragile tests that fail for irrelevant markup changes.

Prefer assertions such as:

```text
advertisement absent
article present
title correct
```

---

# 168. Test Contract with Data Model

Every canonical data structure in `11-DATA-MODEL.md` should have:

```text
valid example
invalid example
serialization test
validation test
```

---

# 169. Test Contract with Security

Every security invariant in `12-SECURITY.md` should map to at least one automated test.

Example:

```text
No eval
→ static security test

Session isolation
→ E2E test

Preset code rejection
→ validator test

UI XSS
→ malicious DOM test
```

---

# 170. Test Contract with Capture Engine

Every Capture Engine state should have coverage:

```text
IDLE
PREPARING
VALIDATING
RENDERING
ENCODING
READY
EXPORTING
COMPLETED
FAILED
CANCELLED
```

---

# 171. Test Contract with Freeze Engine

Every Freeze state should have coverage:

```text
UNFROZEN
FREEZING
FROZEN
DEGRADED
FAILED
```

---

# 172. Test Contract with Cleanup Engine

Every cleanup action:

```text
DELETE
HIDE
KEEP
```

must have:

```text
apply
undo
redo
failure
```

coverage.

---

# 173. Test Contract with Preset Engine

Every preset lifecycle:

```text
detect
validate
review
apply
partial
stale
fail
```

must be tested.

---

# 174. Test Contract with Messaging

Every message category should have:

```text
valid request
invalid request
unknown command
timeout
wrong session
wrong tab
malformed response
```

tests.

---

# 175. Browser API Mocking

Unit tests should mock browser APIs.

Example:

```text
chrome.storage
chrome.tabs
chrome.scripting
chrome.downloads
```

But browser API mocks must not replace actual Chrome integration tests.

---

# 176. Mock vs Real Browser

Rule:

```text
Algorithm
→ Mock browser

Browser behavior
→ Real Chromium
```

This prevents both:

```text
slow unit tests
```

and:

```text
false confidence from unrealistic mocks
```

---

# 177. Capture API Testing

If Chrome capture APIs are used, the implementation must have a dedicated integration suite because browser mocks cannot reproduce:

```text
actual rendering
permissions
viewport behavior
devicePixelRatio
browser capture limits
```

---

# 178. Real Browser Screenshot Testing

At least one test must execute:

```text
fixture page
→ NewsClean cleanup
→ actual browser capture
→ PNG decode
```

This is the definitive capture test.

---

# 179. Visual Determinism

Capture fixtures should disable:

```text
animation
transition
random content
time-dependent content
external resources
```

unless those behaviors are specifically being tested.

---

# 180. Freeze vs Capture Tests

There must be a test proving:

```text
without Freeze
→ unstable output

with Freeze
→ stable output
```

This validates the product's fundamental premise.

---

# 181. Stability Test

Capture the same frozen page multiple times:

```text
Capture A
Capture B
Capture C
```

Expected:

```text
A ≈ B ≈ C
```

within the documented visual tolerance.

---

# 182. Cleanup Determinism

Apply the same preset to the same fixture multiple times.

Expected:

```text
same final DOM structure
```

and:

```text
same capture result
```

within rendering tolerance.

---

# 183. Preset Determinism

A preset must not depend on:

```text
execution order
randomness
network timing
DOM traversal order
```

unless explicitly designed.

---

# 184. Test Observability

Every major engine should expose enough diagnostics for tests to understand failure.

Examples:

```text
Freeze:
status + diagnostics

Extraction:
candidates + scores

Cleanup:
operation history

Preset:
validation checks

Capture:
phase + dimensions + timing
```

---

# 185. Test Artifacts

Failed CI runs should preserve:

```text
screenshots
videos where useful
trace files
diff images
logs
captured HTML fixture state
```

Playwright traces are particularly useful for browser-level debugging.

---

# 186. Test Reports

CI should generate:

```text
unit report
coverage report
E2E report
visual report
security report
```

The reports do not need to be exposed to users.

---

# 187. Regression Policy

Every production bug should produce:

```text
1. Bug reproduction
2. Automated regression test
3. Fix
4. CI verification
```

No critical bug should be fixed without adding a test.

---

# 188. Bug Classification

Recommended:

```text
P0
Security / data loss / extension unusable

P1
Core workflow broken

P2
Feature degraded

P3
Visual / minor UX issue
```

---

# 189. P0 Examples

```text
arbitrary JavaScript execution
preset executes code
capture leaks sensitive browser content
cross-tab cleanup
persistent article leakage
extension crashes Chrome workflow
```

---

# 190. P1 Examples

```text
Freeze completely broken
Cleanup deletes article
Undo corrupts page
Capture produces unusable PNG
Preset removes protected content
```

---

# 191. Definition of Done

A feature is not considered complete until:

```text
Implementation
✓

Unit tests
✓

Integration tests
✓

Security tests
✓

Browser test where applicable
✓

Documentation
✓

Regression coverage
✓
```

---

# 192. MVP Test Scope

The MVP must test at minimum:

```text
1. Extension activation.
2. Page freeze.
3. DOM inspection.
4. Element selection.
5. Delete.
6. Hide.
7. Keep.
8. Undo.
9. Redo.
10. Reset.
11. Article extraction.
12. Preset detection.
13. Preset application.
14. Manual cleanup.
15. Visible PNG capture.
16. Element PNG capture.
17. Full-page PNG capture.
18. PNG validity.
19. UI exclusion from capture.
20. Navigation isolation.
21. Multi-tab isolation.
22. Malicious DOM.
23. Invalid preset.
24. Invalid message.
25. Unsupported browser page.
```

---

# 193. MVP Quality Bar

The MVP should not ship simply because:

```text
"it works on my machine."
```

It must demonstrate:

```text
deterministic cleanup
+
safe DOM interaction
+
stable capture
+
browser lifecycle handling
```

---

# 194. Testing Architecture

Final testing architecture:

```text
                         CI
                          │
              ┌───────────┴───────────┐
              │                       │
          STATIC                    RUNTIME
              │                       │
       ┌──────┼──────┐       ┌────────┼────────┐
       │      │      │       │        │        │
    Typecheck Lint Security Unit   Integration E2E
                                      │        │
                                      │        ├── Browser
                                      │        ├── Visual
                                      │        └── Capture
                                      │
                                      └── Engines
```

---

# 195. Testing Data Flow

```text
Fixture
   ↓
Input Validation
   ↓
Engine
   ↓
Domain State
   ↓
Expected State
   ↓
Browser Rendering
   ↓
PNG
   ↓
Visual Validation
```

---

# 196. Final Testing Principle

NewsClean is a browser tool whose final product is not merely a DOM transformation.

Its actual output is:

```text
A stable, clean, visually correct PNG
```

Therefore the testing strategy must validate the complete chain:

```text
PAGE
 ↓
FREEZE
 ↓
INSPECT
 ↓
CLEAN
 ↓
EXTRACT
 ↓
CAPTURE
 ↓
PNG
```

A successful unit test of the Cleanup Engine is not sufficient if the browser capture still contains advertisements.

A successful capture test is not sufficient if a malicious page can inject code into the extension.

The quality bar is the entire pipeline.

---

# 197. Final Testing Invariants

The following are mandatory:

```text
1. Core domain logic is independently testable.
2. Browser behavior is tested in real Chromium.
3. Critical workflows have E2E coverage.
4. PNG output has automated validation.
5. Capture has visual regression tests.
6. Security invariants have automated tests.
7. Malicious DOM fixtures exist.
8. Malformed presets are tested.
9. Message validation is tested.
10. Session isolation is tested.
11. Navigation races are tested.
12. Undo/Redo semantics are tested.
13. Preset determinism is tested.
14. Freeze stability is tested.
15. Long-page capture is tested.
16. RTL content is tested.
17. Large DOM performance is benchmarked.
18. Memory behavior of repeated captures is tested.
19. Production builds are tested as extension artifacts.
20. Every critical production bug generates a regression test.
```

---

# 198. Final Quality Gate

Before declaring NewsClean MVP production-ready:

```text
                 NEWS CLEAN MVP

             ┌─────────────────┐
             │  STATIC CHECKS  │
             │       ✓         │
             └────────┬────────┘
                      │
             ┌────────▼────────┐
             │   UNIT TESTS    │
             │       ✓         │
             └────────┬────────┘
                      │
             ┌────────▼────────┐
             │  INTEGRATION    │
             │       ✓         │
             └────────┬────────┘
                      │
             ┌────────▼────────┐
             │    SECURITY     │
             │       ✓         │
             └────────┬────────┘
                      │
             ┌────────▼────────┐
             │      E2E        │
             │       ✓         │
             └────────┬────────┘
                      │
             ┌────────▼────────┐
             │     VISUAL      │
             │       ✓         │
             └────────┬────────┘
                      │
             ┌────────▼────────┐
             │   PERFORMANCE   │
             │       ✓         │
             └────────┬────────┘
                      │
                      ▼
                PRODUCTION
```

---

# 199. Next Document

`14-IMPLEMENTATION-PLAN.md` — Implementation Plan

سيحوّل الوثائق من `01` إلى `13` إلى خطة تنفيذ فعلية، مع تحديد:

```text
Repository Structure
Phase 0 — Project Bootstrap
Phase 1 — Extension Shell
Phase 2 — Session Architecture
Phase 3 — Freeze Engine
Phase 4 — DOM Inspector
Phase 5 — Cleanup Engine
Phase 6 — Article Extraction
Phase 7 — Preset System
Phase 8 — Capture Engine
Phase 9 — UI/UX Integration
Phase 10 — Security Hardening
Phase 11 — Testing & QA
Phase 12 — Production Build
```

مع dependency graph واضح يحدد ما الذي يجب بناؤه أولاً وما الذي يمكن تطويره بالتوازي.
