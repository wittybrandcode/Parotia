# NewsClean

## Testing Strategy

**Document ID:** `13-TESTING`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`, `10-UI-UX.md`, `11-DATA-MODEL.md`, `12-SECURITY.md`

---

## 1. Purpose & Philosophy

NewsClean interacts with arbitrary webpages, browser APIs, asynchronous operations, DOM mutation, page rendering, and PNG generation, so tests must verify five dimensions simultaneously: **Correctness, Browser compatibility, DOM safety, Visual correctness, Operational reliability**.

**Central principle:** the core engines must be testable without Chrome, while browser integration and capture behavior are validated inside a real Chromium environment.

NewsClean uses a layered strategy with a target distribution (targets, not hard constraints):

| Layer | Target |
| --- | --- |
| E2E / UI | 10% |
| Integration | 20% |
| Unit | 55% |
| Static / Security | 15% |

Most logic must be tested without launching Chrome. Layers: L0 Static Analysis, L1 Unit, L2 Component, L3 Engine Integration, L4 Browser Integration, L5 End-to-End, L6 Visual Regression, L7 Security, L8 Performance, L9 Real-Site Compatibility.

## 2. Testing Objectives

The test system must guarantee NewsClean:

```text
1.  Freezes supported pages reliably.
2.  Correctly identifies DOM elements.
3.  Deletes only intended elements.
4.  Restores deleted elements through Undo.
5.  Applies presets deterministically.
6.  Does not execute preset/page-controlled code.
7.  Extracts article structure correctly.
8.  Produces clean PNG output.
9.  Does not capture NewsClean UI.
10. Survives malformed webpages.
11. Isolates browser tabs and sessions.
12. Handles navigation races.
13. Handles asynchronous failures.
14. Does not leak article content.
15. Remains usable on real news websites.
```

## 3. Static Gates (L0)

Every CI run performs: `npm run typecheck`, `npm run lint`, `npm run build`, plus schema validation and dependency checks. No production build is accepted if type checking fails.

Strict TypeScript configuration:

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

Zero-any policy: no implicit any, no unnecessary explicit any, no unsafe casts; the `11-DATA-MODEL.md` domain model stays strongly typed. Lint detects unused variables, unsafe casts, dangerous DOM APIs, unhandled promises, and security anti-patterns; custom rules flag `eval()`, `new Function()`, `innerHTML`, and `document.write()` inside extension code.

The production build is tested as an actual Chrome extension artifact — `manifest.json`, service worker, content scripts, extension UI, assets, and CSP all present. CI validates `manifest_version = 3`, permissions, host_permissions, content_scripts, background, action, CSP, and web_accessible_resources against architectural requirements.

## 4. Unit Tests

Unit tests are the primary mechanism for pure logic. Unit-testable modules: `SelectorGenerator`, `SelectorValidator`, `ElementReference`, `PresetMatcher`, `PresetValidator`, `PresetMigrator`, `ExtractionScorer`, `CleanupPlanner`, `CleanupHistory`, `CommandValidator`, `MessageValidator`, `FilenameSanitizer`, `CaptureGeometry`, `SessionManager`. Prefer pure functions (input + configuration → output) over global-state/DOM/storage/random pipelines so tests are deterministic.

### Element & Selector

- Selector generation, resolution, invalid-selector handling, stale references, duplicate selectors, special characters. `<div id="article">` must produce a stable usable reference.
- Special characters: `news-item`, `news:item`, `123article`, `foo/bar`, `العنوان` — must never produce invalid selectors.
- `.article` → `VALID`; `.article[` → `INVALID_SELECTOR`; the system never crashes.
- Collisions: selector + context must not accidentally target the wrong element.
- Stale reference: select `.sidebar` → remove it externally → execute DELETE → `TARGET_NOT_FOUND`, never delete another element.

### Inspector & Overlay

- Hover detection, selection, parent/child selection, selector display, breadcrumb generation, element metadata.
- The Inspector must never select its own UI — hovering the toolbar must never produce `DIV#newsclean-root` as the page target.
- Overlay: position, scroll synchronization, viewport boundaries, resize synchronization, selection/hover state. Near the top/bottom/left/right, the contextual toolbar must remain visible.

### Cleanup Engine

Test DELETE, HIDE, KEEP, BATCH DELETE, UNDO, REDO, RESET independently.

- **Delete:** `DELETE .ad` removes `.ad`, preserves `<article>`.
- **Hide:** DOM node remains, visual representation disappears — distinguish DELETE from HIDE.
- **Keep:** element remains, protection state recorded; a subsequent automated cleanup respects the Keep rule. Mandatory regression: KEEP article → SMART CLEANUP → article untouched.
- **Batch:** 3 × `.ad` → 1 logical history operation, 3 affected elements; Undo restores all three.
- **Undo/Redo/Invalidation/Reset:** DELETE A → UNDO restores A; DELETE A → UNDO → REDO deletes A; DELETE A → UNDO → DELETE B empties the REDO stack; DELETE A, HIDE B, KEEP C, RESET → A/B restored, C protection removed (Keep semantics per `06-CLEANUP-ENGINE.md`).
- **Idempotency:** `DELETE .ad` twice → no target or safely ignored, never undefined behavior.

### Extraction Engine

- Minimum fixture categories: standard article; ± sidebar, ads, newsletter, related content, hero image, subtitle, author.
- Fixtures under `tests/fixtures/extraction/{simple,complex,noisy,malformed,international}`; each fixture has HTML, expected structure, expected confidence.
- Golden tests compare semantic fields of the `ExtractionResult`, not fragile DOM serialization.
- **Regression:** a change causing HIGH → LOW confidence on a known fixture fails CI unless the fixture is intentionally updated.
- **False positives:** must not identify sidebar, related article, advertisement, comment section, or newsletter as the primary article.
- **False negatives:** must identify articles that are not a simple `<article>` element.

### Preset System

Test matching, validation, application, migration, staleness, partial application, conflicts.

- `example.com /news/article` matches preset `example.com /news/*`; `example.com/sports` → `NO_MATCH` when the preset is `/news/*`.
- `selector = .article-body, matchCount = 1, required = true` → `PASS`; required selector with `matchCount = 0` → `STALE` (or the defined degraded state); title 1 + body 1 + hero 0 matches → `PARTIAL`, not `FAILED`, unless the missing hero is required.
- Migration: every schema version v1 → migration → current model must produce a valid current object.
- **Preset security tests** (all rejected safely): script field, function field, eval field, unknown action, invalid selector, prototype pollution attempt, oversized object, invalid schema version.
- **Prototype pollution:** `{ "__proto__": { "isAdmin": true } }` must not alter application prototypes.
- **Oversized:** a 100,000-selector preset must not freeze the extension.

### Freeze Engine

Distinguish DOM freeze, visual freeze, animation freeze, network stabilization, and capture readiness; the engine exposes measurable state.

- Stable page + FREEZE → `FROZEN` within the defined timeout.
- Deliberately unstable page (continuous DOM mutations) → `DEGRADED` or `FAILED` per the freeze strategy; the engine must never claim `FROZEN` while the page is demonstrably still changing (no false FROZEN).
- **Idempotency:** FREEZE + FREEZE must not produce multiple conflicting freeze layers → "already frozen" or an equivalent safe state.
- Unfreeze (if supported): FREEZE + UNFREEZE restores the page's relevant runtime behavior; the extension's own cleanup modifications must not be confused with the freeze state.
- Animation fixture (`animation: move 1s infinite`) → computed visual state stable; transition fixture (`transition: transform 500ms`) → capture never captures an intermediate transition state; mutation fixture (`setInterval` updating `textContent`) → detected/stabilized per the implementation contract.

## 5. Capture Engine Tests

Capture is one of the most difficult parts of the system and requires both unit and browser-level tests.

- **Unit:** target geometry, scale calculation, viewport calculation, segment calculation, stitching geometry, filename generation, dimension validation. Given viewport 1280×900 and target 100,100,800×2000, the engine calculates the correct capture region.
- **High DPI:** at `devicePixelRatio = 2`, distinguish CSS pixels from output pixels.
- **Segmentation:** no overlap or controlled overlap per the stitching strategy; synthetic stitch tests verify final dimensions and ordering.
- **Output:** every capture fixture decodes to a valid image; the PNG signature must begin `89 50 4E 47 0D 0A 1A 0A`; dimensions valid.
- **UI exclusion (mandatory E2E):** the NewsClean toolbar, selection/hover outline, and context menu must not appear in the final PNG.
- **Hidden element:** HIDE ad → capture → ad absent. **Deleted element:** DELETE sidebar → capture → sidebar absent. **Kept element:** KEEP article image → SMART CLEANUP → capture → image remains.

## 6. Browser Integration (L4/L5)

Browser integration tests use a real Chromium environment via **Playwright**: launch Chromium, load the extension, create tabs, navigate pages, interact with the DOM, capture screenshots. Test harness: `tests/browser/{extension, fixtures, pages, specs}`.

Per-test lifecycle: launch Chromium → load extension → open fixture page → create session → perform workflow → assert state → capture output if required → close context. The test runner must load the **built** extension (not an arbitrary source directory) to catch manifest errors, build errors, missing assets, and CSP issues.

Do not use real news websites as the primary deterministic test environment. Build controlled pages: `tests/pages/{basic-article, noisy-article, dynamic-article, malicious-article, long-article, iframe-article, malformed-article}.html`.

- **Basic:** header, logo, title, subtitle, hero image, body, author, date, sidebar, advertisement, footer — the primary end-to-end fixture.
- **Noisy:** multiple ads, newsletter, social widgets, related articles, sticky banner, cookie banner, video, sidebar → clean article.
- **Dynamic:** setInterval, MutationObserver, lazy content, animated elements (Freeze Engine testing).
- **Malicious:** `<script>`, `<img onerror>`, svg event attributes, malicious class names/IDs; no payload executes in the NewsClean UI.
- **Long:** long enough to require multiple capture segments — canonical full-page capture test.
- **International / RTL:** Arabic, French, English article content; Arabic fixture uses `<html dir="rtl">` and verifies extraction, inspection, cleanup, and capture remain correct.

### E2E Tests

| ID | Scenario | Key assertions |
| --- | --- | --- |
| 01 Launch | Open supported article, activate NewsClean | toolbar visible, session active, page visually unchanged |
| 02 Freeze | Activate, Freeze | status = FROZEN, fixture page stable |
| 03 Inspect | Freeze, Inspect, hover + click title | title selected, context actions visible |
| 04 Delete | Select advertisement, Delete | ad removed, cleanup counter = 1 |
| 05 Undo | Delete, Undo | advertisement restored |
| 06 Redo | Delete, Undo, Redo | advertisement removed |
| 07 Delete Similar | Select `.advertisement`, Delete Similar | all matching ads removed, one logical history operation |
| 08 Preset | Open fixture, preset detected, review, apply | defined noise removed, article preserved |
| 09 Manual Override | Preset applied, Inspect, delete additional element | preset changes remain, manual cleanup applied |
| 10 Keep | KEEP hero image, apply smart cleanup | hero image remains |
| 11 Capture Visible | Clean page, Capture Visible | PNG created, dimensions valid, NewsClean UI absent |
| 12 Capture Element | Select article, Capture Element | PNG contains article region |
| 13 Full Page | Clean, Capture Full Page | PNG height = complete page, segments correctly stitched |
| 14 Navigation | Open article A, select element, navigate to B | Session A destroyed, Session B created, no stale-reference operation |
| 15 Multi-Tab | Tab A → article A, Tab B → article B, delete in A | B unchanged |
| 16 Malicious DOM | Open malicious fixture, inspect element | no script execution, no UI injection, no extension crash |
| 17 Invalid Preset | Import malformed preset | rejected, existing presets unaffected |
| 18 Unsupported Page | Open unsupported browser page | "NewsClean unavailable" state, no extension errors |

## 7. Visual Regression

Visual testing is essential because the product's output is a PNG. Two separate systems that must not be mixed: **(A) extension UI visual regression** and **(B) captured article visual regression**.

- UI goldens: toolbar, inspect mode, selected element, preset panel, capture panel, error state, RTL UI.
- Capture goldens: deterministic HTML + CSS + assets fixture → expected PNG, compared against the actual capture.
- Comparison uses a documented tolerance, not 100% pixel equality; perceptual metrics (pixel diff, SSIM, perceptual hash) are standardized before CI enforcement.
- Goldens live in `tests/visual/{ui, captures}`, versioned with the code. Updating a golden requires explicit developer intent via `npm run test:visual:update` — never automatic in CI.
- Failure output: `expected.png`, `actual.png`, `diff.png`.

## 8. Security Testing

Security tests are first-class tests, not an optional final audit. Coverage: XSS, selector injection, preset injection, message injection, prototype pollution, permission misuse, unsafe DOM APIs, filename injection, session isolation.

- **Static:** CI fails if production code contains `eval(`, `new Function(`, or `document.write(`; review also covers unsafe `innerHTML`, `outerHTML`, `insertAdjacentHTML`.
- **DOM XSS:** page-controlled strings never become executable NewsClean markup.
- **Message fuzzing:** null, undefined, `[]`, `{}`, huge string/object, wrong types, unknown commands, missing session → reject safely.
- **Preset fuzzing:** deep nesting, huge arrays, null values, wrong primitive types, unexpected fields, invalid selectors/actions.
- **Selector fuzzing:** unicode, quotes, brackets, slashes, colons, spaces, escaped characters — the Selector Engine never crashes.
- **Mutation fuzzing:** element exists → external mutation → element replaced → cleanup command → safe failure, never mutation of an unintended target.
- Fuzzing focuses on input boundaries: HTML, selectors, JSON presets, messages, filenames, URLs, class names, IDs, text content.

## 9. Performance & Memory

News pages can contain thousands of DOM nodes.

- **DOM size benchmarks** at 1,000 / 5,000 / 10,000 / 25,000 / 50,000 nodes; measure inspector startup, freeze, extraction, preset validation, cleanup, capture preparation.
- **Budgets** (engineering targets, not guarantees; real-world pages may require adaptive behavior):

| Operation | Budget |
| --- | --- |
| Toolbar activation | < 100 ms |
| Simple inspection | < 16 ms per interaction frame |
| Basic selector operation | < 50 ms |
| Preset validation | < 250 ms |
| Simple extraction | < 500 ms |

- Inspector hover uses `elementFromPoint` → overlay update, never a full DOM scan per `mousemove`. Deleting an element is O(1) relative to unrelated page elements; selector-wide operations are proportional to matches. Extraction avoids repeated `querySelectorAll`; candidate discovery is bounded and prioritized. Capture measures prepare, render, segment, stitch, encode, export separately to identify bottlenecks.
- **Memory tests** detect memory spikes, Blob retention, ImageBitmap leaks, and canvas retention. Capture 20 large articles sequentially → memory returns toward baseline after each. A long-running session (inspect/delete/undo/redo/preset/capture, repeated) must not exhibit unbounded memory growth.

## 10. Compatibility

MVP targets Google Chrome and Chromium-based browsers where Manifest V3 behavior is compatible; primary CI target is Chromium.

Real-site compatibility uses a controlled set representing common architectures: traditional CMS, React, Next.js, Vue, WordPress, custom newsroom CMS, heavy advertising, video-heavy, RTL, French, Arabic. Real sites must **not** become mandatory CI dependencies (site changes, network failures, geo restrictions, anti-bot, rate limits) — run a scheduled compatibility suite separately, and capture deterministic snapshots of page structures as regression fixtures when possible (real-world origin + deterministic environment).

## 11. Determinism & Fixtures

- Most automated tests use a **local fixture server** for HTML/CSS/images/JS; they do not require the public internet.
- Capture tests use deterministic assets — avoid external fonts, images, videos, analytics that can change rendering.
- **Time determinism:** dynamic pages use controlled clocks; avoid assertions on `Date.now()` unless time is explicitly mocked. **Randomness:** mock the ID generator for deterministic unit tests; tests never depend on uncontrolled randomness.
- **Test data factories:** `createPageContext()`, `createElementReference()`, `createCleanupOperation()`, `createPreset()`, `createExtractionResult()`, `createCaptureResult()` — prevents duplicated fragile object literals.
- Test naming describes behavior ("deletes only the selected advertisement", not "testDelete1"). Organization: `tests/{unit/{cleanup, extraction, presets, messaging, security, capture}, integration/{cleanup, extraction, presets, session}, browser/{fixtures, specs, extension}, visual/{ui, captures}, performance}`. `*.test.ts` for unit/integration, `*.spec.ts` for browser/E2E.
- Snapshot tests may cover domain objects, message schemas, and preset normalization, but must not replace behavioral tests. Do not snapshot the entire DOM after every operation (fragile against irrelevant markup changes); prefer assertions such as "advertisement absent / article present / title correct".

## 12. Test Commands

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

## 13. Coverage

Coverage is measured but never the sole quality metric; the highest priority is behavioral coverage of critical paths.

| Area | Target |
| --- | --- |
| Domain logic | ≥ 90% |
| Utilities | ≥ 90% |
| Engine logic | ≥ 85% |
| Messaging | ≥ 90% |
| Security validators | ≥ 95% |
| UI components | ≥ 75% |

Critical paths must have E2E coverage: **Open → Freeze → Inspect → Delete → Undo → Capture**, and **Open → Freeze → Preset → Apply → Capture**. Negative paths: freeze fails, extraction fails, preset invalid, selector invalid, element disappears, capture fails, download fails, navigation occurs, tab closes.

## 14. Failure, Timeout & Concurrency

- **Failure injection:** mock storage failure, capture failure, selector failure, stale reference, message timeout — tests recovery paths without real browser failures.
- **Timeout testing:** every async engine has timeout tests (capture never completing → `CAPTURE_TIMEOUT`, not an indefinitely pending promise).
- **Cancellation:** capture starts → cancel → `CAPTURE_CANCELLED`, temporary resources released.
- **Concurrency:** capture + navigation, cleanup + preset application, inspection + navigation, preset validation + session close.
- **Command ordering:** CAPTURE before FREEZE → `NOT_FROZEN` if the capture contract requires freezing. **State machine:** the Session state machine is tested for invalid transitions (e.g. `CAPTURING → INSPECTING` must reject or cancel capture first, per the defined state machine).

## 15. Property-Based Tests

Property-based testing is considered for: selector generation, filename sanitization, preset validation, history operations, geometry calculations.

- `sanitizeFilename(input)` never returns a path separator.
- History: for any valid cleanup operation, apply → undo restores the logical pre-operation state; apply → undo → redo reproduces the post-operation state.
- Capture: for width/height/scale > 0, capture geometry never produces negative width, negative height, NaN, or Infinity.
- Security: for any arbitrary page-controlled string, `renderAsNewsCleanUI(string)` never executes it as code.

## 16. Accessibility

UI tests verify keyboard navigation, focus, ARIA labels, button names, modal focus, RTL layout, and contrast; automated accessibility tooling may be integrated into Playwright. **Keyboard E2E:** the critical workflow (Freeze, Inspect, Delete, Undo, Capture) is possible via shortcuts where defined. **RTL E2E:** the Arabic interface is tested for toolbar order, context menus, dialogs, text alignment, icons, and keyboard behavior.

## 17. CI

- **Matrix:** Node.js (supported LTS) + Chromium (current stable); nightly/scheduled Chromium beta where practical.
- **Pipeline order:** PUSH → Typecheck → Lint → Unit → Security → Build → Integration → E2E → Visual.
- **Fast CI (pull requests):** typecheck, lint, unit, security, build, critical E2E.
- **Full CI (main):** full E2E, visual, performance smoke tests.
- **Nightly:** large DOM, long capture, memory, extended workflows, real-site compatibility, Chromium beta.
- **Release gate:** no release when critical unit tests fail, critical E2E fails, security tests fail, build fails, manifest validation fails, or visual regression is unexplained.
- **Flaky tests:** identified → isolated → diagnosed → fixed; retries may hide real browser race conditions. **Test isolation:** fresh browser context, session, and fixture state where practical; clean up browser contexts, temporary files, generated PNGs, storage, and local fixtures after tests.

## 18. Test Contracts

- `11-DATA-MODEL.md`: every canonical data structure has a valid example, an invalid example, a serialization test, and a validation test.
- `12-SECURITY.md`: every security invariant maps to at least one automated test (no eval → static security test; session isolation → E2E test; preset code rejection → validator test; UI XSS → malicious DOM test).
- Engine state coverage: Capture (IDLE, PREPARING, VALIDATING, RENDERING, ENCODING, READY, EXPORTING, COMPLETED, FAILED, CANCELLED); Freeze (UNFROZEN, FREEZING, FROZEN, DEGRADED, FAILED); Cleanup actions (DELETE, HIDE, KEEP) each have apply, undo, redo, and failure coverage; Preset lifecycle (detect, validate, review, apply, partial, stale, fail) all tested; Messaging — each message category has valid request, invalid request, unknown command, timeout, wrong session, wrong tab, and malformed response tests.
- Browser API mocking: mock `chrome.storage`, `chrome.tabs`, `chrome.scripting`, `chrome.downloads`, but mocks never replace real Chrome integration tests. Rule: **algorithm → mock browser; browser behavior → real Chromium**. If Chrome capture APIs are used, there is a dedicated integration suite (mocks cannot reproduce actual rendering, permissions, viewport behavior, devicePixelRatio, capture limits). At least one test executes fixture page → NewsClean cleanup → real browser capture → PNG decode — the definitive capture test.

## 19. Visual Determinism & Stability

Capture fixtures disable animation, transition, random content, time-dependent content, and external resources unless those behaviors are specifically under test. A test must prove the product premise: without Freeze → unstable output; with Freeze → stable output. Capturing the same frozen page 3× → A ≈ B ≈ C within the documented tolerance. Applying the same preset to the same fixture 3× → same final DOM structure and same capture result within rendering tolerance. A preset must not depend on execution order, randomness, network timing, or DOM traversal order unless explicitly designed.

## 20. Observability, Artifacts & Reports

Every major engine exposes enough diagnostics for tests to understand failure: Freeze (status + diagnostics), Extraction (candidates + scores), Cleanup (operation history), Preset (validation checks), Capture (phase + dimensions + timing). Failed CI runs preserve screenshots, videos where useful, Playwright traces, diff images, logs, and captured HTML fixture state. CI generates unit, coverage, E2E, visual, and security reports (not user-facing).

## 21. Regression Policy & Bug Classification

Every production bug produces: **bug reproduction → automated regression test → fix → CI verification**; no critical bug is fixed without adding a test.

| Priority | Definition |
| --- | --- |
| P0 | Security / data loss / extension unusable |
| P1 | Core workflow broken |
| P2 | Feature degraded |
| P3 | Visual / minor UX issue |

P0 examples: arbitrary JavaScript execution, preset executes code, capture leaks sensitive browser content, cross-tab cleanup, persistent article leakage, extension crashes Chrome workflow. P1 examples: Freeze completely broken, cleanup deletes article, Undo corrupts page, capture produces unusable PNG, preset removes protected content.

## 22. Definition of Done

A feature is not considered complete until all that apply are satisfied: implementation, unit tests, integration tests, security tests, browser test where applicable, documentation, regression coverage.

## 23. MVP Test Scope

The MVP must test at minimum:

```text
1.  Extension activation.
2.  Page freeze.
3.  DOM inspection.
4.  Element selection.
5.  Delete.
6.  Hide.
7.  Keep.
8.  Undo.
9.  Redo.
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

The MVP must not ship simply because "it works on my machine" — it must demonstrate deterministic cleanup, safe DOM interaction, stable capture, and browser lifecycle handling.

## 24. Quality Gate

Before declaring NewsClean MVP production-ready, the full pipeline must pass in order: **static checks → unit tests → integration → security → E2E → visual → performance**.

## 25. Final Testing Invariants

The following are mandatory:

```text
1.  Core domain logic is independently testable.
2.  Browser behavior is tested in real Chromium.
3.  Critical workflows have E2E coverage.
4.  PNG output has automated validation.
5.  Capture has visual regression tests.
6.  Security invariants have automated tests.
7.  Malicious DOM fixtures exist.
8.  Malformed presets are tested.
9.  Message validation is tested.
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
