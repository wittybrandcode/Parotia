# NewsClean

## Security & Browser Constraints

**Document ID:** `12-SECURITY`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`, `10-UI-UX.md`, `11-DATA-MODEL.md`

---

## 1. Purpose

NewsClean deliberately interacts with arbitrary third-party webpages, so the webpage, its DOM, page-provided data, imported presets, and content-script messages must all be treated as untrusted. Chrome's extension platform provides isolated worlds for content scripts, but messages from content scripts must still be treated as attacker-controlled input. The extension must remain as isolated from the page as Chrome's architecture allows.

**Security objective:** allow NewsClean to manipulate the current webpage without allowing the webpage to manipulate NewsClean's privileged extension context.

## 2. Trust Boundaries

NewsClean has four principal trust zones. The most important boundary is **Extension ≠ Webpage**.

| Zone | Component | Trust |
| --- | --- | --- |
| A | Browser / Chrome | Trusted |
| B | Extension privileged context (service worker, storage, capture, downloads) | Trusted |
| C | Extension content script (isolated world) | Semi-trusted |
| D | Third-party webpage | Untrusted |

Content scripts run in the default isolated world: page JavaScript cannot access content-script variables and vice versa. Avoid the MAIN world unless a specific browser limitation makes it unavoidable.

## 3. Threat Model

NewsClean must explicitly consider:

T1 Malicious webpage · T2 Malicious advertisement · T3 Malicious iframe · T4 Malicious DOM content · T5 Malicious article content · T6 Malicious imported preset · T7 Compromised external resource · T8 Malicious extension message · T9 Cross-site scripting through NewsClean UI · T10 Privilege escalation · T11 Data leakage · T12 Remote code execution · T13 Unsafe browser permissions · T14 Capture of unintended content · T15 Storage poisoning

## 4. Code Execution Bans

Hard architectural rule: page-provided data is data, never code. NewsClean must contain **0 uses of `eval()`** (including indirect variants) and no `new Function()` or code generated from preset/selector/HTML/JSON/URL. Forbidden:

```js
eval(pageData);
new Function(pageData)();
setTimeout(pageData, 1000);
script.textContent = pageData;
```

Also forbidden: creating `<script src>` from webpage-controlled values (executable code must remain statically bundled) and loading remote executable code (Manifest V3 prohibits remotely hosted executable code and dynamically executing fetched strings). In the UI, avoid `element.innerHTML = untrustedData` and `document.write()`; prefer `element.textContent` or safe DOM construction. See Security Invariants 2–4.

## 5. Untrusted Page Data

All DOM input read by the Inspector (`tagName`, `className`, `id`, `attributes`, `text`, `selector`) is potentially attacker-controlled. A class such as `</div><script>...` must never become executable markup in NewsClean's interface. Element labels (e.g. `DIV.sidebar`) are generated with safe text nodes, never `toolbar.innerHTML = \`<span>${className}</span>\``. Selectors are untrusted data: **generate → validate → use**, never construct executable code from a selector. Invalid selectors produce `INVALID_SELECTOR` rather than crashing the engine.

## 6. Preset Security

Presets are configuration, never executable code. A preset may contain `hostname`, `path`, `selector`, `action`, `category`, `metadata`; it must never contain `javascript`, `script`, `function`, `eval` expression, or arbitrary command. The preset validator rejects unknown dangerous fields, e.g.:

```json
{ "selector": ".ad", "action": "DELETE", "script": "fetch('evil.example')" }
```

Imported presets follow the pipeline **IMPORT → PARSE → VALIDATION → NORMALIZATION → REVIEW → SAVE** — never IMPORT → EXECUTE.

Trust ladder: **Built-in** (highest trust) → **User-created** (trusted by user) → **Imported** (untrusted) → **Community** (untrusted until validated). Regardless of origin, no preset may execute code.

## 7. Permissions

Principle: request the minimum Chrome permissions, contain no speculative permissions, and give every permission a direct product justification:

- `storage` → save presets/settings
- `scripting` → inspect/manipulate active webpage
- `activeTab` → temporary access to the page explicitly activated by user
- `downloads` → save PNG automatically (only if `chrome.downloads` is used)

NewsClean activates only after explicit user action: user clicks → NewsClean activates → current tab becomes the active session. Prefer `activeTab` over broad permanent host permissions; **avoid `host_permissions: ["<all_urls>"]`** unless a concrete feature requires it — NewsClean does not need to continuously monitor every page. Keep scripting operations scoped to the current tab, current session, and known NewsClean code. If automatic site presets would require page access before explicit activation, evaluate that separately rather than silently expanding permissions.

## 8. Manifest Baseline

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "scripting"
  ],
  "optional_permissions": [
    "downloads"
  ],
  "optional_host_permissions": [],
  "content_security_policy": {
    "extension_pages": "default-src 'self'; object-src 'self'"
  }
}
```

The final manifest is generated only after the implementation documents determine exactly which Chrome APIs are required, and must be validated against the actual implementation.

## 9. Storage

- `storage.local` (10 MB quota by default) → persistent settings and presets.
- `storage.session` or memory → ephemeral runtime data (selected element, cleanup history, capture state, temporary diagnostics).
- Content scripts should not get direct access to persistent settings: **Content Script → Message → Service Worker → Storage**.
- Do not use `chrome.storage.sync` for article-derived or potentially confidential data (small quotas; Chrome warns against confidential user data in local/sync storage).
- No article body persistence by default, no screenshot persistence in extension storage, no browsing history collection, no external analytics.

## 10. Network & Privacy

- No external backend required; the complete workflow (freeze, inspect, cleanup, extract, capture, preset, export) is a local browser workflow.
- **No page-content telemetry in MVP**: never send article title, article body, page screenshot, DOM tree, URL, or selected text to an external endpoint. Hard privacy requirement.
- Do not fetch the article from a backend — the current browser page is the working source; this avoids CORS complexity, credential exposure, network leakage, and duplicate content processing.
- Future remote data (e.g. preset repository): HTTPS only + schema validation + signature/version validation where appropriate; remote data is never interpreted as executable code; never `fetch → eval(response)`.
- No `chrome.cookies` permission; the workflow does not require it. Never extract session cookies, authorization headers, passwords, or tokens — NewsClean works against the visible DOM, never extracts credentials.

## 11. Iframes & DOM Encapsulation

Treat iframe content as a separate security boundary. Never attempt to access arbitrary cross-origin iframe internals; the Inspector treats a cross-origin iframe as `IFRAME`. Same-origin frames may be inspectable where extension rules permit — an explicit capability, not an implicit assumption. **MVP: main document inspected; same-origin iframe optional; cross-origin iframe not inspected.**

Distinguish Light DOM from Shadow DOM; the MVP need not expose Shadow DOM internals unless required by real-world target sites. Closed shadow roots are treated as inaccessible — never bypass browser encapsulation. Custom elements (`<news-card>`, `<article-view>`, `<site-header>`) are normal DOM elements for selection; their internals are not automatically trusted or inspected.

## 12. Unsupported Pages & Site Behavior

Gracefully report "NewsClean is unavailable on this page" (never fail silently) for `chrome://`, `chrome-extension://`, `about:`, the Chrome Web Store, and browser internal pages. PDF → unsupported / separate future workflow; `file://` is not assumed to work (separate permissions and configuration) — MVP targets HTTPS/HTTP pages. Sandboxed frames must not be relied on for primary extraction. Respect the target website's CSP — never depend on bypassing it. Page JavaScript may detect DOM changes (an expected operational conflict), but NewsClean must not attempt to defeat anti-bot, security systems, authentication, or access controls — its role is editorial page cleanup. Freeze must not globally disable browser security mechanisms (only page-level behavior relevant to the freeze state), and **Freeze ≠ Destroy JavaScript** (some article rendering depends on JS) — follow the strategy in `04-FREEZE-ENGINE.md`.

## 13. Network Blocking (MVP)

`webRequest` blocking and `declarativeNetRequest` are **not** part of the MVP security model. They add permission complexity, site compatibility issues, browser policy constraints, and debugging complexity. Network blocking is introduced only if a future requirement demonstrates page freezing cannot be achieved otherwise. First implementation focuses on **DOM freeze + mutation control + capture stability**.

## 14. Capture Security

Capture only the explicitly requested target: `ELEMENT` output corresponds to that element; `VISIBLE` to the viewport; `FULL_PAGE` to the defined capture region. Before capture, validate: target exists, target is visible/valid, page is frozen, capture state is valid.

Enter **CAPTURE PREPARATION** and temporarily hide the toolbar, inspector overlay, selection overlay, dialogs, and toasts so the NewsClean interface is excluded from the final PNG (security and UX both require this). Never unintentionally capture browser chrome, other tabs, the desktop, or other applications — the capture architecture operates only on the intended page/target. If Chrome tab capture/screenshot APIs are used, document the permission and API constraints at implementation time; a page DOM capture must not be assumed equivalent to a full browser-window capture.

## 15. Message Security

Every message arriving from a content script is untrusted (content-script messages can be crafted by an attacker). Validate `type`, `payload shape`, `sessionId`, `elementId`, `selector`, and `command parameters` before execution. Unknown commands return `UNKNOWN_COMMAND` — never try to interpret unknown payloads dynamically.

The service worker maintains an explicit command allowlist; anything else is rejected:

```text
FREEZE
INSPECT_START
INSPECT_STOP
DELETE_ELEMENT
HIDE_ELEMENT
KEEP_ELEMENT
UNDO
REDO
RESET
APPLY_PRESET
CAPTURE
EXPORT
```

- **Session validation (mandatory tab isolation):** a command with `sessionId = A` must never modify session B.
- **Element ID validation:** `elementId` must belong to the active session; an attacker must not be able to fabricate `element-999999` and cause an unrelated operation.
- **Selector re-validation:** even if NewsClean generated the selector, validate it again at each privileged boundary (defense in depth: UI → message validation → domain validation → DOM operation).

## 16. Error Handling & Exception Isolation

Security-sensitive errors never expose internal stack traces, extension filesystem paths, or secret configuration to the webpage; user-facing errors are concise. A malformed page must never crash the extension architecture — e.g. a DOM Inspector error becomes "Inspector unavailable for this element", never a service-worker failure.

## 17. Component Responsibilities

Content script: DOM observation, DOM inspection, DOM cleanup execution through the engine, overlay rendering, page-local operations. It must not own persistent settings, download history, external synchronization, or privileged API credentials.

Service worker: coordinates sessions, messages, storage, presets, downloads — without becoming a second DOM engine.

## 18. UI Security

UI data flow: **page data → text → validated state → safe UI rendering**; never page data → raw HTML → NewsClean UI. Mount the UI inside a Shadow Root to reduce the target site's CSS interfering with NewsClean controls and to reduce style leakage outward. Default to **no `web_accessible_resources`** unless a specific feature requires them. Avoid remote fonts (use system fonts or bundled fonts if licensing permits); never load runtime icons from unpkg/jsDelivr/Google Fonts/remote CDNs — icons are bundled.

Third-party dependencies must be audited, pinned, and bundled; avoid unnecessary dependencies in the content script (it runs directly alongside untrusted page content). Every dependency must answer: why is it required, can a browser API replace it, does it execute dynamic code, does it access the network, does it increase bundle size? Supply chain: lockfile, pinned versions, dependency audit, reproducible builds where practical; never install packages dynamically at runtime.

Production artifacts ship only what is required — no source maps, test fixtures, debug scripts, development servers, or unused binaries. Local development may use `localhost`/`127.0.0.1` (MV3 CSP allows certain localhost sources for unpacked extensions), but production must be self-contained. A development-only debug mode may expose DOM diagnostics, message logs, engine timings, and preset validation, but must never weaken security invariants: no eval, no remote script, no arbitrary code execution — even in development.

## 19. Logging & Reporting

Production logs never contain article body, selected text, cookies, authentication tokens, or complete HTML; prefer `sessionId`, event type, duration, error code. Development logging may include selector information (selector ≠ article content); keep logs minimal. No remote error telemetry in MVP; if remote diagnostics are introduced later they must be opt-in, anonymized, with no article content and no URL unless necessary.

## 20. Service Worker Lifecycle (MV3)

Manifest V3 uses event-driven service workers that may stop when idle; never rely on global in-memory service-worker state remaining alive indefinitely. Persistent runtime state is stored in `storage.session` or reconstructed when necessary; short-lived execution state may remain in memory.

Large captures must not assume a single background execution context stays alive — keep the actual page-local capture process close to the tab/content runtime. Every long-running operation (freeze, extraction, preset validation, capture, export) supports cancellation where possible, preventing stale operations after context changes.

- **Tab closure:** active tab closes → Session CANCELLED; all page references invalid.
- **Navigation race:** capture started on Article A, user navigates to Article B — verify `sessionId`, `tabId`, `page context` still match the intended session, else `CAPTURE_CANCELLED`.
- **Stale async operations:** every async operation validates its current context before committing (extraction A finishing after navigation must not overwrite extraction B).
- **Race prevention:** use `sessionId` + `operationId` where necessary to prevent old-operation/new-session cross-contamination.
- **Reload:** new session, never resurrect stale DOM references. **Back/Forward:** new document → new session; the persistent preset remains available.

## 21. Tab & Session Isolation

Each tab and each window is isolated. Tab 1 / example.com / Session A and Tab 2 / example.com / Session B may both use the same preset, but **cleanup A ≠ cleanup B**.

## 22. Graceful Degradation

If a required permission is unavailable, the feature is unavailable — not an extension crash (e.g. "PNG download permission unavailable. You can still capture and use the browser's save workflow."). Degradation ladder:

```text
Full workflow → Manual cleanup → Manual extraction → Visible capture
```

A failure in one advanced feature must not destroy the entire workflow. Balance strict technical boundaries with a simple operator experience: an invalid preset selector yields "Preset partially available", not a technical stack trace.

## 23. Browser Constraint Matrix

| Capability | MVP | Constraint |
| --- | --- | --- |
| Inspect DOM | Yes | Content script / page access |
| Delete DOM elements | Yes | Page DOM only |
| Hide elements | Yes | Page DOM only |
| Freeze page | Yes | Browser/page behavior limitations |
| Article extraction | Yes | DOM-dependent |
| Presets | Yes | Local configuration |
| PNG capture | Yes | Browser capture constraints |
| Full-page capture | Yes | Segmentation/stitching where necessary |
| Cross-origin iframe inspection | No | Same-origin/browser restrictions |
| Chrome internal pages | No | Browser restriction |
| Remote code execution | Never | MV3 security restriction |
| Arbitrary page JS execution | Never | Security invariant |
| Persistent article storage | No | Privacy |
| Remote analytics | No | Privacy |
| Cookie access | No | Not required |
| Broad host permissions | Avoid | Least privilege |
| `downloads` permission | Optional | Only if API is used |

## 24. Filename & Download Security

Filenames derive from page-controlled values (article title, hostname, date). The filename generator sanitizes filesystem-sensitive characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, and others) and must produce a **basename only** — a page title must never produce `../../secret.txt` or `..\..\secret.txt`. Prefer browser-native download behavior where possible; if `chrome.downloads` is used: PNG → download API → user-selected filename, with no unrelated file access. Before export, validate `mimeType === image/png`, `width > 0`, `height > 0`.

## 25. Security Review & Tests

Pre-release review gate: manifest review, dependency audit, CSP review, message validation review, storage review, preset security review, DOM injection review, capture permission review, download filename review, privacy review.

Automated security tests cover: malformed selector, malformed preset, malicious class name, malicious article title, HTML injection, script injection, malformed message, unknown command, wrong session ID, wrong tab ID, stale element reference, navigation during capture, navigation during extraction, storage corruption, preset schema mismatch, invalid download filename, unsupported page, cross-origin iframe.

- **XSS test:** `<h1><img src=x onerror="alert(1)"></h1>` must display as data and never execute `alert(1)`.
- **Preset injection test:** `{ "selector": ".ad", "action": "DELETE", "script": "alert(1)" }` is rejected by the validator.
- **Message injection test:** `{ "type": "EXECUTE_CODE", ... }` → `UNKNOWN_COMMAND`.
- **Session isolation test:** element-001 in session A must never affect session B.
- **Navigation security test:** Article A's cleanup references are never executed against Article B.
- **Storage poisoning test:** corrupted stored presets (invalid schema/selector/action, unexpected fields) are rejected or migrated safely, without executing anything.
- **Capture security test:** output must not contain toolbar, inspector overlay, selection outline, toast, or modal unless explicitly requested as page content.
- **Filename security test:** title `../../../../secret` → `secret.png` (or another sanitized basename), never `../../../../secret.png`.

Run `npm audit` / equivalent before every production release; critical vulnerabilities in runtime dependencies block release until resolved or formally accepted. NewsClean must not evolve into a tool for bypassing paywalls, authentication, CAPTCHA, anti-bot systems, access controls, or browser security boundaries — the product is editorial cleanup + visual capture, not access circumvention.

## 26. Security Invariants

The following are hard requirements:

```text
1.  Manifest V3.
2.  No eval().
3.  No new Function().
4.  No remote executable code.
5.  No arbitrary JavaScript from presets.
6.  No arbitrary JavaScript from page content.
7.  Content scripts use isolated worlds by default.
8.  Privileged operations remain outside the page context.
9.  Messages are validated.
10. Session IDs isolate tabs.
11. DOM references are session-scoped.
12. Persistent data is schema-validated.
13. Imported presets are untrusted.
14. No article content telemetry in MVP.
15. No screenshot uploads in MVP.
16. No cookie permission.
17. No broad permissions without justification.
18. Cross-origin iframe internals are not assumed accessible.
19. NewsClean UI is isolated from page CSS.
20. NewsClean UI never enters PNG capture.
21. Download filenames are sanitized.
22. Navigation invalidates the active session.
23. Async operations verify session identity before committing.
24. Storage contains configuration, not screenshots.
25. Security failures degrade gracefully.
```

## 27. Production Readiness Gate

NewsClean is not production-ready until all of the following are explicitly verified:

```text
DOM security
Preset security
Message validation
Permission minimization
CSP
Storage isolation
Capture isolation
Navigation/session isolation
Dependency audit
Privacy review
```
