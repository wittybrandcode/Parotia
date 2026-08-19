# Security Model

Parotia follows a defense-in-depth security architecture. Every boundary between execution contexts validates input before any side effect occurs.

---

## Principles

1. **Zero trust at every boundary** — Commands are validated at the Service Worker, Content Runtime, and UI layers independently.
2. **No remote code** — CSP restricts to `script-src 'self'; object-src 'self'`. No inline scripts, no eval, no remote resources.
3. **Minimal permissions** — Only the permissions required for core functionality. No `webRequest`, no `cookies`, no `<all_urls>`.
4. **No data exfiltration** — Zero network activity. All processing is local to the browser.
5. **Session-scoped identifiers** — Element IDs are session-scoped (`createId` uses timestamp + random). Never persisted across sessions.

---

## Validation Layers

### Layer 1: Command Type Allowlist

Every incoming message is checked against a hardcoded allowlist before any processing:

```typescript
// src/shared/types/messages.ts
export const BACKGROUND_COMMAND_TYPES = [
  "START_SESSION", "FREEZE_PAGE", "UNFREEZE_PAGE",
  "INSPECT_START", "INSPECT_STOP", "DELETE_ELEMENT",
  "HIDE_ELEMENT", "SHOW_ELEMENT", "DELETE_MATCHING",
  "UNDO", "REDO", "UNDO_TO", "RESET",
  "CAPTURE", "PREPARE_CAPTURE", "RESTORE_CAPTURE",
  // ... 28 total
] as const;

export function isBackgroundCommand(value: unknown): value is BackgroundCommand {
  // Runtime type guard — validates type against allowlist
}
```

Unknown commands are rejected with `UNKNOWN_COMMAND` error. No code path executes for unrecognized types.

### Layer 2: Payload Validation

At the Service Worker boundary (`service-worker.ts:validatePayload()`), every command's payload is validated:

- Required fields present
- Enum values match expected sets
- String lengths within bounds
- Numeric values are finite and positive
- Session ID format validated

At the Content Runtime boundary (`content/index.ts:validatePayload()`), session mismatch is rejected:

```typescript
if (payload.sessionId !== session.id) {
  return { success: false, error: { code: "SESSION_NOT_FOUND", ... } };
}
```

### Layer 3: Origin Checks

**Toolbar iframe resize messages** (`overlay.ts`):
```typescript
if (event.origin !== extensionOrigin) return;
if (event.source !== frame.contentWindow) return;
```

**State broadcasts** (`App.tsx`):
```typescript
if (event.source !== window.parent) return;
if (broadcast.source !== "newsclean-content") return;
```

**postMessage targets** — Never `"*"`. Always `chrome.runtime.getURL().origin`:
```typescript
// content/index.ts
const targetOrigin = chrome.runtime.getURL().split("/").slice(0, 3).join("/");
iframe.contentWindow.postMessage(broadcast, targetOrigin);
```

---

## UI Isolation

| Mechanism | Purpose |
|-----------|---------|
| Shadow DOM | Toolbar immune to page CSS injection |
| `data-newsclean-root` | Marks extension root for inspection exclusion |
| `data-newsclean-highlight` | Marks hover overlays for capture exclusion |
| `isNewsCleanUi()` | Prevents inspector from selecting own elements |
| `CAPTURE_ATTR` | Marks isolated elements during capture |

---

## Filename Sanitization

All exported PNG filenames pass through `sanitizeFilenamePart()`:

1. **NFKC normalization** — Unicode canonical decomposition
2. **Forbidden char removal** — `\ / : * ? " < > |`
3. **Control char removal** — All characters below U+0020
4. **Whitespace collapse** — Multiple spaces → single space
5. **Dot stripping** — Leading/trailing dots removed (prevents `..` path traversal)
6. **Length cap** — 80 characters max

---

## Stale Reference Defense

When the DOM mutates between reference creation and resolution:

```
ElementReference created → DOM mutation → resolve() fails → STALE_REFERENCE error
```

The system never acts on an element it cannot resolve. This prevents:
- Acting on wrong elements after DOM changes
- Exploiting timing between reference creation and action
- Cascading errors from stale references

---

## Capture Security

- **Canvas size limits** — `MAX_CANVAS_DIMENSION = 32767` enforced before any capture
- **White fill** — Prevents transparent pixel data leakage
- **ImageBitmap** — Efficient drawing without data URL intermediaries
- **Stale data cleanup** — `purgeStaleCaptureData()` runs on SW startup to clean orphaned base64 data from killed workers

---

## Data Lifecycle

```
chrome.storage.local
├── Staged capture data (temporary, cleaned after download)
├── Page context (session-scoped, cleaned on session end)
└── Purged on SW startup (orphaned data from crashed workers)
```

No persistent user data is stored. No analytics, no telemetry, no cookies.

---

## Threat Model

| Threat | Mitigation |
|--------|------------|
| XSS via page scripts | Shadow DOM isolation, no `innerHTML` with user content |
| CSS injection | Shadow DOM, `isNewsCleanUi()` exclusion |
| Stale session hijacking | Session ID validation at every command |
| Path traversal | `sanitizeFilenamePart()` dot stripping |
| Remote code execution | CSP `script-src 'self'` |
| Data exfiltration | Zero network activity, no `fetch()` to external URLs |
| Canvas data leakage | White fill, controlled capture pipeline |
| Extension UI spoofing | `data-newsclean-root` exclusion, origin checks |
| DOM mutation during capture | Stability window, MutationObserver monitoring |
