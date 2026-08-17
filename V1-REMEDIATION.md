# Parotia v1.0.0 — Pre-Publication Remediation Plan

> Goal: Fix all issues blocking Chrome Web Store publication.
> Audit date: 2026-08-17 | Tests: 254/254 | Gates: green

---

## Dashboard

```
[ 37/38 ] █████████████████████████████████████░░░░
```

---

## §1 — CRITICAL / HIGH (must fix before v1)

| # | Severity | Issue | Files | Status |
|---|----------|-------|-------|--------|
| 1.1 | HIGH | `scrollTab` sends empty `sessionId` → scroll never restored | `service-worker.ts` | 🟢 |
| 1.2 | HIGH | No storage cleanup for stale `capture:*` / `elementcapture:*` / `regioncapture:*` keys | `service-worker.ts` | 🟢 |
| 1.3 | HIGH | Missing `minimum_chrome_version: "120"` in manifest | `build-manifest.mjs` | 🟢 |
| 1.4 | HIGH | No privacy policy (CWS requirement) | NEW: `PRIVACY_POLICY.md` + manifest `homepage_url` | 🟢 |
| 1.5 | HIGH | Version still `0.2.0` — should be `1.0.0` | `package.json` | 🟢 |
| 1.6 | HIGH | `chrome.action.onClicked` crashes on `chrome://` / PDF pages (unhandled rejection) | `service-worker.ts` | 🟢 |

## §2 — MEDIUM (should fix for quality)

| # | Severity | Issue | Files | Status |
|---|----------|-------|-------|--------|
| 2.1 | MEDIUM | `ensureDownloadsPermission()` is dead code (permission is always granted) | `service-worker.ts` | 🟢 |
| 2.2 | MEDIUM | Missing `content_security_policy` in manifest | `build-manifest.mjs` | 🟢 |
| 2.3 | MEDIUM | `downloadPng` silently swallows real error (disk full, filename too long, etc.) | `service-worker.ts` | 🟢 |
| 2.4 | MEDIUM | `recoverTabForSession()` swallows errors silently | `service-worker.ts` | 🟢 |
| 2.5 | MEDIUM | No schema migration on preset load (`SCHEMA_VERSION` never checked) | `storage/schema.ts`, `chromeStorageRepositories.ts` | 🟢 |
| 2.6 | MEDIUM | No confirmation dialog for destructive Reset | `App.tsx` | 🟢 |
| 2.7 | MEDIUM | Free-select buttons lack `aria-label` + no focus management | `freeSelect.ts` | 🟢 |
| 2.8 | MEDIUM | Freeze degraded state not communicated to user | `freezeEngine.ts`, `index.ts`, `App.tsx` | 🟢 |
| 2.9 | MEDIUM | `elementCapture.restore()` not called on some error paths in content | `index.ts` (PREPARE_ELEMENT_CAPTURE) | 🟢 |
| 2.10 | MEDIUM | Options page has no error handling for storage failures | `options.tsx` | 🟢 |

## §3 — LOW (nice to fix)

| # | Severity | Issue | Files | Status |
|---|----------|-------|-------|--------|
| 3.1 | LOW | `web_accessible_resources` too broad — narrow to needed files | `build-manifest.mjs` | 🟢 |
| 3.2 | LOW | `unlimitedStorage` needs justification comment for CWS | `build-manifest.mjs` | 🟢 |
| 3.3 | LOW | `innerHTML` in inspector replaced with DOM construction | `inspector.ts` | 🟢 |
| 3.4 | LOW | `postMessage` fallback origin `"*"` in `main.tsx` | `main.tsx` | 🟢 |
| 3.5 | LOW | Overlay `document.body` may be null (early injection) | `overlay.ts` | 🟢 |
| 3.6 | LOW | Action log panel lacks `aria-live` | `App.tsx` | 🟢 |
| 3.7 | LOW | Inspector overlays lack `aria-hidden` | `inspector.ts` | 🟢 |
| 3.8 | LOW | `matchEngine.findSimilar()` queries `body *` — perf on large pages | `matchEngine.ts` | 🟢 |
| 3.9 | LOW | `hideToolbar` / `showToolbar` silent catch blocks lack debug logs | `service-worker.ts` | 🟢 |
| 3.10 | LOW | Build filename `build-esm.mjs` is misleading (outputs IIFE) | `build-esm.mjs` (comment added) | 🟢 |
| 3.11 | LOW | `tabs` permission not declared but `setZoom`/`getZoom` used | `build-manifest.mjs` | 🟢 |
| 3.12 | LOW | Button labels hidden — first-time users may be confused | `styles.css` | 🟢 |
| 3.13 | LOW | `chrome.storage.local` read-modify-write race on presets | `chromeStorageRepositories.ts` | 🟢 |
| 3.14 | LOW | `content_scripts: []` — CWS may ask about dynamic injection | `build-manifest.mjs` (comment) | 🟢 |

## §4 — E2E TESTS (recommended)

| # | Issue | Status |
|---|-------|--------|
| 4.1 | Add E2E test: toolbar renders in real page | 🟢 |
| 4.2 | Add E2E test: freeze/unfreeze flow | 🟢 |
| 4.3 | Add E2E test: capture visible (download verification) | 🟢 |
| 4.4 | Add E2E test: `chrome://` page does not crash | 🟢 |

## §5 — Chrome Web Store Preparation

| # | Issue | Status |
|---|-------|--------|
| 5.1 | Create `PRIVACY_POLICY.md` (or hosted URL) | 🟢 |
| 5.2 | Create CWS listing description | 🟢 |
| 5.3 | Prepare screenshots / promo images | 🔴 |
| 5.4 | Verify all permissions have justification | 🟢 |

---

## Execution Order

1. **§1** — HIGH fixes (1.1 → 1.6) ✅
2. **§2** — MEDIUM fixes (2.1 → 2.10) ✅
3. **§3** — LOW fixes (3.1 → 3.14) ✅
4. **§4** — E2E tests
5. **§5** — CWS prep
6. Gate: `typecheck + lint + test + build + E2E`
7. Commit + push after each batch
8. Bump version to `1.0.0` at the very end
