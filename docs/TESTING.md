# Testing Strategy

Parotia uses a three-tier testing approach: unit/integration tests with Vitest, E2E smoke tests with Playwright, and enforced coverage thresholds.

---

## Test Frameworks

| Framework | Version | Purpose | Environment |
|-----------|---------|---------|-------------|
| Vitest | 2.1.9 | Unit & integration tests | happy-dom |
| Playwright | 1.49.1 | E2E smoke test | Real Chromium |
| @testing-library/react | 16.3.2 | React component testing | happy-dom |

---

## Running Tests

```bash
npm run test            # Run all Vitest tests (208 tests)
npm run test:watch      # Watch mode
npm run test:coverage   # Run with coverage report + threshold enforcement
npm run test:e2e        # Playwright E2E (builds first via pretest:e2e)
```

---

## Test Structure

```
tests/
├── setup.ts                          # Global chrome.* stubs
├── background/
│   └── service-worker.test.ts        # 21 tests — dispatch, validation, capture
├── content/
│   ├── contentIndex.test.ts          # 13 tests — command hub, lifecycle
│   ├── session/
│   │   └── session.test.ts           # 4 tests — creation, transitions
│   ├── inspector/
│   │   └── inspector.test.ts         # 13 tests — picker, overlay, action bar
│   ├── selection/
│   │   └── freeSelect.test.ts        # 11 tests — drawing, resize, capture
│   ├── freeze/
│   │   └── freezeEngine.test.ts      # 7 tests — freeze, stability, degraded
│   ├── overlay/
│   │   └── overlay.test.ts           # 4 tests — shadow DOM, iframe
│   ├── extraction/
│   │   ├── extractionEngine.test.ts  # 5 tests — scoring, candidates
│   │   └── score.test.ts             # 3 tests — text/link density
│   ├── cleanup/
│   │   └── cleanupEngine.test.ts     # 24 tests — delete/hide/undo/redo
│   ├── mutation/
│   │   ├── mutationEngine.test.ts    # 11 tests — DOM mutations, undo
│   │   └── history.test.ts           # 11 tests — LIFO stack, undoTo
│   ├── matching/
│   │   └── matchEngine.test.ts       # 7 tests — similarity, signatures
│   ├── keyboard/
│   │   └── shortcuts.test.ts         # 6 tests — freeze/pick/delete/escape
│   └── capture/
│       ├── sliceMath.test.ts         # 6 tests — slice planning
│       ├── fixedHeaders.test.ts      # 10 tests — detection, hide/restore
│       ├── elementCapture.test.ts    # 8 tests — isolation, eager images
│       └── captureStitcher.test.ts   # 8 tests — canvas stitching
├── shared/
│   ├── id.test.ts                    # 3 tests — uniqueness
│   └── utils/
│       ├── filename.test.ts          # 8 tests — sanitization, traversal
│       └── selector.test.ts          # 10 tests — validation, generation
├── ui/
│   ├── app.test.tsx                  # 10 tests — toolbar, buttons, state
│   └── options.test.tsx              # 5 tests — options page, i18n
└── e2e/
    └── smoke.spec.ts                 # Playwright — extension load, SW start
```

---

## Coverage Thresholds

Enforced in `vitest.config.ts`:

| Metric | Threshold |
|--------|-----------|
| Statements | ≥ 80% |
| Functions | ≥ 80% |
| Lines | ≥ 80% |
| Branches | ≥ 75% |

Coverage exclusions:
- Barrel re-exports (`index.ts`)
- Type-only modules (no runtime code)

---

## Chrome API Mocking

All `chrome.*` APIs are mocked in `tests/setup.ts`:

```typescript
// Global stubs available in every test
globalThis.chrome = {
  runtime: { sendMessage, onMessage, getURL, lastError },
  tabs: { query, get, sendMessage, captureVisibleTab, getZoom, setZoom },
  storage: { local: { get, set, remove } },
  action: { onClicked },
  scripting: { executeScript },
  downloads: { download },
};
```

Each test file can override specific methods for its scenario.

---

## Test Categories

### Unit Tests
Test individual functions in isolation:
- `score.test.ts` — `scoreCandidate()` pure function
- `sliceMath.test.ts` — `planSlices()` pure math
- `filename.test.ts` — `sanitizeFilenamePart()` pure function
- `id.test.ts` — `createId()` pure function

### Integration Tests
Test engine interactions within a single context:
- `cleanupEngine.test.ts` — Cleanup + Mutation + History working together
- `inspector.test.ts` — Inspector + DOM interactions
- `contentIndex.test.ts` — Full command routing through the hub

### End-to-End Tests
Playwright boots the real extension in Chromium:
- Loads `dist/` as unpacked extension
- Verifies service worker registers
- Navigates to options page
- Confirms `chrome.storage` interaction

---

## Writing New Tests

### Convention

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("moduleName", () => {
  beforeEach(() => {
    // Reset state between tests
  });

  it("does something specific", () => {
    // Arrange
    const input = createTestElement();
    
    // Act
    const result = module.function(input);
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

### Best Practices

1. **Test behavior, not implementation** — Don't assert internal state; assert observable outcomes.
2. **Use `beforeEach`** — Reset shared state between tests.
3. **Mock minimally** — Only mock what's outside the test boundary.
4. **Test edge cases** — Empty inputs, boundary values, error paths.
5. **Keep tests fast** — Unit tests should complete in milliseconds.
