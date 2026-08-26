# Testing strategy

## Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run build
npm run test:e2e
```

`test:coverage` is the canonical unit/integration gate. It runs Vitest once, writes text/HTML/JSON reports, enforces the global thresholds, then runs `scripts/check-critical-coverage.mjs`.

`npm run coverage:gaps` reads the latest JSON summary and prints the remaining Lines/Statements/Functions/Branches debt, ordered by the files with the largest uncovered executable surface. The audited execution plan is tracked in [`COVERAGE-100-PLAN.md`](./COVERAGE-100-PLAN.md).

## Enforced thresholds

| Scope | Lines | Statements | Functions | Branches |
|---|---:|---:|---:|---:|
| Global baseline guard | 92.2% | 92.2% | 85.1% | 83.0% |
| `captureHandler.ts` | 85% | — | 85% | 75% |
| `AnnotationLayer.ts` | 85% | — | 85% | 75% |
| `editorModal.ts` | 85% | — | 85% | 75% |
| `sessionRegistry.ts` | 85% | — | 85% | 75% |
| `editorTickets.ts` | 90% | — | 90% | 80% |
| `captureCoordinator.ts` | 90% | — | 90% | 80% |

Thresholds are release constraints and must not be lowered to pass a change.

The unit-coverage scope excludes only type-only modules, barrel exports and declarative React mount entries. The real built editor mount remains covered by Playwright. Executable Chrome, DOM, Canvas and React modules stay inside the measured scope even when they require contract mocks or browser tests.

## What the suites prove

- Coordinate stitching: overlap, out-of-order input, non-zero base scroll, clamped final viewport and gap rejection.
- DOM transactions: exact style priority and attribute presence after success/failure/re-entry.
- Media readiness: lazy images, browser-owned picture selection, SVG, CSS background, poster and open Shadow DOM with timeout diagnostics.
- Session/security: worker hydration, closed tabs, sender mismatch, exact editor URL/tab, expiry and concurrent replay.
- Editor: direct Konva annotation behavior, bounded mixed-operation history, operation errors, real Chromium draw/save ticket consumption.
- Large-image preflight: PNG IHDR parsing, device-aware memory budgets, dimension/pixel/memory rejection, direct-original download and zero Canvas allocation on rejected editor input.
- Freeze/cleanup: continuous mutation deadline, iframe/fixed-header priority restore, regenerated descendants and original `display!important`.

The deterministic browser fixture is `tests/fixtures/capture-matrix.html`. It contains article, long checker pattern, Twitter-like avatar, RTL content, canvas, picture, SVG, video poster, CSS background, hidden content and open Shadow DOM. Add `?dynamic=1` to create continuous mutations.

## Playwright

Playwright loads the actual `dist/` extension in Chromium. It verifies worker boot, extension storage, navigation survival, restricted-page resilience, and a real editor flow that stages a PNG, draws on Konva, saves and consumes its capability. Capture mode orchestration is exhaustively exercised at the worker/content boundary because Chromium headless does not expose a reliable automation primitive for clicking a native extension action and granting `activeTab`.

CI builds `dist/` once, uploads it, downloads the same artifact in the E2E job and uploads Playwright traces/screenshots on failure.

## Regression rules

1. Reproduce a defect with an invariant-focused test before changing production behavior.
2. Assert pixels/coordinates/DOM restoration/ownership, not only mock call counts.
3. Include failure injection for any new storage, messaging, decode, canvas or download boundary.
4. Use fake timers for deadlines, and assert observer/listener/style cleanup.
5. Keep legacy `data-newsclean-*` fixtures until the documented compatibility migration ends.
