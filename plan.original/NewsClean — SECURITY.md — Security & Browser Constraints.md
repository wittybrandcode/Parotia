# NewsClean

## Security & Browser Constraints

**Document ID:** `12-SECURITY`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`, `10-UI-UX.md`, `11-DATA-MODEL.md`

---

## 1. Purpose

This document defines the security model, browser constraints, permission strategy, trust boundaries, and security invariants for NewsClean.

NewsClean is fundamentally different from a normal extension because it deliberately interacts with arbitrary third-party webpages.

The extension must therefore assume that:

```text
The webpage is untrusted.
The DOM is untrusted.
Page-provided data is untrusted.
Imported presets are untrusted.
Messages originating from content scripts are untrusted.
```

The extension itself must remain isolated from the page as much as Chrome's extension architecture allows.

Chrome's extension platform provides isolated worlds for content scripts, but Chrome explicitly warns that content scripts still interact with potentially hostile pages and that messages from content scripts should be treated as attacker-controlled input. ([Chrome for Developers][1])

---

# 2. Security Objective

The primary security objective is:

> **Allow NewsClean to manipulate the current webpage without allowing the webpage to manipulate NewsClean's privileged extension context.**

The security boundary is therefore:

```text
                 UNTRUSTED
┌─────────────────────────────────┐
│         NEWS WEB PAGE           │
│                                 │
│ HTML                            │
│ CSS                             │
│ JavaScript                      │
│ Ads                             │
│ Third-party widgets             │
│ Embedded frames                 │
└───────────────┬─────────────────┘
                │
                │ LIMITED BRIDGE
                ▼
┌─────────────────────────────────┐
│       CONTENT SCRIPT            │
│       ISOLATED WORLD             │
└───────────────┬─────────────────┘
                │
                │ VALIDATED MESSAGE
                ▼
┌─────────────────────────────────┐
│     EXTENSION PRIVILEGED        │
│                                 │
│ Service Worker                  │
│ Storage                         │
│ Capture                         │
│ Downloads                       │
└─────────────────────────────────┘
                 TRUSTED
```

---

# 3. Threat Model

NewsClean must explicitly consider the following threat classes:

```text
T1  Malicious webpage
T2  Malicious advertisement
T3  Malicious iframe
T4  Malicious DOM content
T5  Malicious article content
T6  Malicious imported preset
T7  Compromised external resource
T8  Malicious extension message
T9  Cross-site scripting through NewsClean UI
T10 Privilege escalation
T11 Data leakage
T12 Remote code execution
T13 Unsafe browser permissions
T14 Capture of unintended content
T15 Storage poisoning
```

---

# 4. Trust Boundaries

NewsClean has four principal trust zones.

```text
ZONE A
Browser / Chrome
        ↓
ZONE B
Extension Privileged Context
        ↓
ZONE C
Extension Content Script
        ↓
ZONE D
Third-party Webpage
```

The most important boundary is:

```text
Extension
     ≠
Webpage
```

---

# 5. Content Script Isolation

NewsClean should use Chrome content scripts in the default isolated world wherever possible.

Chrome documents that content scripts run in an isolated JavaScript environment, preventing page scripts from directly accessing the content script's JavaScript variables. ([Chrome for Developers][1])

Therefore:

```text
Page JavaScript
      X
Content Script Variables
```

and:

```text
Content Script
      X
Page JavaScript Variables
```

are separated.

---

# 6. Main World Restriction

NewsClean should avoid executing its logic in:

```text
MAIN world
```

unless a specific browser limitation makes it unavoidable.

The default should remain:

```text
ISOLATED world
```

The Chrome `scripting` API supports isolated and page contexts, but privileged extension logic should remain outside the page's execution environment. ([Chrome for Developers][2])

---

# 7. No Arbitrary Page Script Execution

NewsClean must never execute arbitrary JavaScript extracted from the webpage.

Forbidden:

```js
eval(pageData);
```

```js
new Function(pageData)();
```

```js
setTimeout(pageData, 1000);
```

```js
script.textContent = pageData;
```

The data model must remain data.

---

# 8. No Remote Code

NewsClean must not load executable JavaScript from external servers.

Forbidden:

```text
https://example.com/newsclean.js
```

as an executable extension dependency.

Manifest V3 specifically prohibits remotely hosted executable code and mechanisms such as `eval()` or dynamically executing fetched strings. ([Chrome for Developers][3])

---

# 9. Extension Code Must Be Bundled

All executable extension logic should ship inside the extension package:

```text
extension/
├── manifest.json
├── service-worker.js
├── content/
├── ui/
├── engines/
└── assets/
```

External resources may provide data where necessary, but not executable extension logic.

---

# 10. Content Security Policy

The extension should define an explicit CSP.

Recommended baseline:

```json
{
  "content_security_policy": {
    "extension_pages": "default-src 'self'; object-src 'self'"
  }
}
```

The exact CSP may evolve with implementation requirements.

Chrome recommends an explicit extension-page CSP and restricts Manifest V3 extension pages from using policies that enable remote code execution. ([Chrome for Developers][4])

---

# 11. No eval

This is a hard architectural rule.

NewsClean must contain:

```text
0 uses of eval()
```

including indirect variants.

---

# 12. No new Function

The following is forbidden:

```js
new Function(...)
```

This includes code generation from:

```text
preset
selector
HTML
JSON
URL
```

---

# 13. No Dynamic Script Injection

NewsClean must never create:

```html
<script src="...">
```

from webpage-controlled values.

The extension's executable code must remain statically bundled.

---

# 14. HTML Injection

The webpage contains attacker-controlled strings.

For example:

```html
<h1>
    <img src=x onerror=...>
</h1>
```

NewsClean must treat extracted article content as text/data.

Do not directly insert arbitrary page HTML into the NewsClean UI.

---

# 15. innerHTML Restriction

Avoid:

```js
element.innerHTML = untrustedData;
```

especially in NewsClean's own UI.

Chrome explicitly recommends avoiding `document.write()` and `innerHTML` where they can create injection opportunities. ([Chrome for Developers][4])

Prefer:

```js
element.textContent = value;
```

or safe DOM construction.

---

# 16. DOM Inspection Is Not Trusted Input

The Inspector reads:

```text
tagName
className
id
attributes
text
selector
```

All of these are potentially attacker-controlled.

For example:

```html
<div class="</div><script>...">
```

must not become executable markup in NewsClean's interface.

---

# 17. Safe Element Labels

If the inspector displays:

```text
DIV.sidebar
```

the label must be generated using safe text nodes.

Not:

```js
toolbar.innerHTML = `<span>${className}</span>`;
```

---

# 18. Selector Injection

Selectors themselves are untrusted data.

A malicious page could contain unusual class names or IDs.

The selector generator must:

```text
generate
→ validate
→ use
```

and never construct executable code from a selector.

---

# 19. CSS Selector Safety

A selector may be passed to:

```js
document.querySelector()
document.querySelectorAll()
```

inside controlled exception handling.

Invalid selectors must produce:

```text
INVALID_SELECTOR
```

rather than crashing the engine.

---

# 20. Preset Security

Presets are configuration.

They are never executable code.

A preset may contain:

```text
hostname
path
selector
action
category
metadata
```

It must never contain:

```text
javascript
script
function
eval expression
arbitrary command
```

---

# 21. Preset Schema Security

The preset validator must reject unknown dangerous fields where appropriate.

For example:

```json
{
  "selector": ".ad",
  "action": "DELETE",
  "script": "fetch('evil.example')"
}
```

must be rejected.

---

# 22. Imported Presets

Imported presets must follow:

```text
IMPORT
 ↓
PARSE
 ↓
SCHEMA VALIDATION
 ↓
SECURITY VALIDATION
 ↓
NORMALIZATION
 ↓
USER REVIEW
 ↓
SAVE
```

Never:

```text
IMPORT
 ↓
EXECUTE
```

---

# 23. Community Presets

Future community presets are considered untrusted.

The trust model is:

```text
Built-in
   ↓
Highest trust

User-created
   ↓
Trusted by user

Imported
   ↓
Untrusted

Community
   ↓
Untrusted until validated
```

Regardless of origin, no preset may execute code.

---

# 24. Permission Principle

NewsClean should request the minimum Chrome permissions required for its functionality.

Chrome recommends minimizing extension permissions because reducing privileges reduces the potential attack surface. ([Chrome for Developers][4])

---

# 25. Initial Permission Strategy

The architecture should prefer:

```json
{
  "permissions": [
    "storage",
    "scripting"
  ],
  "optional_permissions": [
    "downloads"
  ]
}
```

with:

```text
activeTab
```

used where appropriate.

The final manifest must be validated against the actual implementation.

---

# 26. activeTab

Where possible, NewsClean should prefer:

```text
activeTab
```

over broad permanent host permissions.

Chrome documents `activeTab` as a mechanism for granting temporary host access to the active tab, including when used with `chrome.scripting`. ([Chrome for Developers][2])

This aligns well with NewsClean's interaction model:

```text
User explicitly activates NewsClean
        ↓
Current tab becomes the working target
```

---

# 27. Broad Host Permissions

Avoid:

```json
{
  "host_permissions": [
    "<all_urls>"
  ]
}
```

unless a concrete feature requires it.

NewsClean does not need to continuously monitor every page in the browser.

---

# 28. User Activation

The extension should ideally operate on the current page only after explicit user action.

Recommended:

```text
User clicks NewsClean
        ↓
NewsClean activates
        ↓
Current tab becomes active session
```

This reduces unnecessary access and makes the security model easier to understand.

---

# 29. Scripting Permission

If runtime injection is used, `chrome.scripting` requires the `scripting` permission plus appropriate host access or `activeTab`. ([Chrome for Developers][2])

The architecture should keep scripting operations narrowly scoped to:

```text
current tab
current session
known NewsClean code
```

---

# 30. Storage Security

Chrome provides several storage areas, including `local`, `sync`, `session`, and `managed`. Current Chrome documentation states that `storage.local` has a 10 MB quota by default, while `storage.session` is in-memory and is cleared when the extension/browser lifecycle requires it. ([Chrome for Developers][5])

NewsClean should use:

```text
storage.local
→ persistent settings/presets

storage.session or memory
→ ephemeral runtime data
```

---

# 31. Sensitive Data

NewsClean should assume that article pages may contain sensitive newsroom information.

Therefore:

```text
No article body persistence by default.
No screenshot persistence in extension storage.
No browsing history collection.
No external analytics.
```

---

# 32. Storage Access Level

Where content scripts do not need direct access to persistent settings, storage should remain restricted to trusted extension contexts.

Chrome's storage API supports access-level controls for storage areas. ([Chrome for Developers][5])

Recommended architecture:

```text
Content Script
      ↓
Message
      ↓
Service Worker
      ↓
Storage
```

rather than exposing all persistent data directly to the page-facing context.

---

# 33. No Sensitive Data in sync

NewsClean should not use:

```text
chrome.storage.sync
```

for article-derived or potentially confidential data.

`sync` is designed for cross-browser synchronization and has comparatively small quotas; Chrome also warns against storing confidential user data in local/sync storage. ([Chrome for Developers][6])

---

# 34. Session Data

Temporary data should remain in memory or `storage.session` when cross-service-worker persistence is needed.

Examples:

```text
selected element
cleanup history
capture state
temporary diagnostics
```

---

# 35. No Page Content Telemetry

The extension must not send:

```text
article title
article body
page screenshot
DOM tree
URL
selected text
```

to an external analytics endpoint in MVP.

This is a hard privacy requirement.

---

# 36. External Network Access

NewsClean does not fundamentally require an external backend.

Therefore the default architecture should be:

```text
Browser
+
Extension
=
Complete local workflow
```

No server is required for:

```text
freeze
inspect
cleanup
extract
capture
preset
export
```

---

# 37. Remote Data

If future functionality requires remote data, such as:

```text
preset repository
```

then:

```text
HTTPS only
+
schema validation
+
signature/version validation where appropriate
```

must be used.

Remote data must never be interpreted as executable code.

---

# 38. HTTPS

Any future external communication must use HTTPS.

Chrome recommends HTTPS for extension network communication to reduce man-in-the-middle risks. ([Chrome for Developers][4])

---

# 39. Cross-Origin Requests

NewsClean should avoid cross-origin requests unless necessary.

If implemented:

```text
request
→ expected domain
→ HTTPS
→ validate response
→ parse as data
```

Do not:

```text
fetch
→ eval(response)
```

---

# 40. Fetching Article Content

NewsClean does not need to fetch the article from its own backend.

The current browser page is already the working source.

This reduces:

```text
CORS complexity
credential exposure
network leakage
duplicate content processing
```

---

# 41. Cookies

NewsClean should not access or transmit cookies.

The workflow does not require:

```text
chrome.cookies
```

and therefore the permission should not be requested.

---

# 42. Authentication Data

NewsClean must never extract:

```text
session cookies
authorization headers
passwords
tokens
```

from the page.

---

# 43. Page Credentials

Even if the current page is behind authentication:

```text
NewsClean
→ works against visible DOM
```

rather than:

```text
NewsClean
→ extracts credentials
```

---

# 44. Iframes

News websites frequently contain:

```text
advertisement iframe
social iframe
video iframe
analytics iframe
```

The extension must treat iframe content as a separate security boundary.

---

# 45. Cross-Origin Iframes

NewsClean should not attempt to access arbitrary cross-origin iframe internals.

The browser's same-origin model prevents unrestricted DOM access across origins.

The Inspector should therefore treat a cross-origin iframe as:

```text
IFRAME
```

rather than attempting to inspect its internal DOM.

---

# 46. Same-Origin Iframes

Same-origin frames may be inspectable where browser extension rules permit it.

However, this should be an explicit capability rather than an implicit assumption.

MVP may restrict inspection to the main document.

---

# 47. Main Document First

Recommended MVP:

```text
Main document
✓

Same-origin iframe
optional

Cross-origin iframe
not inspected
```

This greatly simplifies security and UX.

---

# 48. Shadow DOM

Modern websites may use Shadow DOM.

The Inspector must distinguish:

```text
Light DOM
Shadow DOM
```

The MVP does not need to expose Shadow DOM internals unless required by real-world target sites.

---

# 49. Closed Shadow DOM

Closed Shadow Roots should be treated as inaccessible.

NewsClean must not attempt to bypass browser encapsulation.

---

# 50. Web Components

Custom elements such as:

```text
<news-card>
<article-view>
<site-header>
```

should be treated as normal DOM elements for selection purposes.

Their internal implementation is not automatically trusted or inspected.

---

# 51. Browser Restricted Pages

Chrome extensions cannot freely operate on every browser surface.

NewsClean must gracefully handle pages such as:

```text
chrome://
chrome-extension://
about:
Chrome Web Store
browser internal pages
```

The extension should show:

```text
NewsClean is unavailable on this page.
```

rather than failing silently.

---

# 52. Chrome Web Store

The extension should not assume it can inject itself into the Chrome Web Store or browser-controlled pages.

The UI must provide a clean unsupported-page state.

---

# 53. PDF Pages

PDF handling is a separate browser capability.

MVP should not assume that a PDF viewer exposes a normal article DOM.

Therefore:

```text
PDF
→ unsupported / separate future workflow
```

unless explicitly implemented later.

---

# 54. File URLs

`file://` pages should not be assumed to work.

They require separate browser permissions and user configuration.

MVP should prefer:

```text
HTTPS
HTTP
```

web pages.

---

# 55. Sandboxed Frames

Sandboxed frames can have restricted origin behavior.

NewsClean should not rely on them for primary extraction.

---

# 56. CSP of the Target Website

The website's own CSP can affect:

```text
injected resources
main-world scripts
network requests
```

NewsClean should therefore avoid techniques that depend on bypassing the site's CSP.

---

# 57. Page JavaScript Interference

Some websites use aggressive JavaScript to detect DOM changes.

NewsClean may need to modify the DOM during cleanup.

This is an expected operational conflict.

However, NewsClean must not attempt to defeat:

```text
anti-bot
security systems
authentication
access controls
```

Its role is editorial page cleanup.

---

# 58. MutationObserver

The Freeze Engine may need to control or monitor DOM mutation.

Security requirement:

```text
Do not globally disable browser security mechanisms.
```

Only page-level behavior relevant to NewsClean's freeze state should be controlled.

---

# 59. JavaScript Suspension

If NewsClean uses techniques to reduce dynamic page behavior, it must not assume that every script can be safely disabled.

Some article rendering depends on JavaScript.

Therefore:

```text
Freeze
≠
Destroy JavaScript
```

The Freeze Engine should follow the strategy defined in `04-FREEZE-ENGINE.md`.

---

# 60. Network Blocking

Network request blocking is not part of the core MVP security model.

NewsClean should not introduce:

```text
webRequest blocking
declarativeNetRequest
```

unless a future requirement specifically demonstrates that page freezing cannot be achieved otherwise.

---

# 61. Why Network Blocking Is Avoided

Network blocking adds:

```text
permission complexity
site compatibility issues
browser policy constraints
debugging complexity
```

The first implementation should focus on:

```text
DOM freeze
+
mutation control
+
capture stability
```

---

# 62. Browser Permission UX

Every requested permission should have a direct product justification.

Example:

```text
storage
→ save presets/settings

scripting
→ inspect/manipulate active webpage

activeTab
→ temporary access to the page explicitly activated by user

downloads
→ save PNG automatically
```

The final manifest should contain no speculative permissions.

---

# 63. Downloads Permission

If NewsClean uses `chrome.downloads`, Chrome requires the `downloads` permission. ([Chrome for Developers][7])

The permission should be added only if the implementation uses the API.

---

# 64. Download Strategy

MVP may prefer browser-native download behavior where possible.

If `chrome.downloads` is used:

```text
PNG
 ↓
download API
 ↓
user-selected filename
```

No unrelated file access is required.

---

# 65. Filename Security

The filename may be derived from:

```text
article title
hostname
date
```

These values are page-controlled.

Therefore the filename generator must sanitize:

```text
/
\
:
*
?
"
<
>
|
```

and other filesystem-sensitive characters.

---

# 66. Path Traversal

A page title must never be able to produce:

```text
../../secret.txt
```

or:

```text
..\..\secret.txt
```

The filename generator must produce a basename only.

---

# 67. Download Content Validation

Before export:

```text
mimeType === image/png
width > 0
height > 0
```

must be validated.

---

# 68. Capture Privacy

The capture engine must capture only the explicitly requested target.

For:

```text
ELEMENT
```

the output must correspond to that element.

For:

```text
VISIBLE
```

the output corresponds to the viewport.

For:

```text
FULL_PAGE
```

the output corresponds to the defined page capture region.

---

# 69. Capture Target Validation

Before capture:

```text
target exists
target is visible/valid
page is frozen
capture state is valid
```

must be checked.

---

# 70. Preventing UI Capture

The NewsClean interface must be excluded from the final PNG.

Security and UX both require this.

The capture process should therefore enter:

```text
CAPTURE PREPARATION
```

and temporarily hide:

```text
toolbar
inspector overlay
selection overlay
dialogs
toasts
```

before capture.

---

# 71. Sensitive Page Content

NewsClean must not unintentionally capture:

```text
browser chrome
other tabs
desktop
other applications
```

The capture architecture should operate only on the intended browser page/target.

---

# 72. Screenshot API Boundary

If the implementation uses Chrome's tab capture/screenshot APIs, the permission and API constraints must be explicitly documented in the implementation phase.

The security model must not assume that a page DOM capture is equivalent to a full browser-window capture.

---

# 73. Message Security

Every message arriving from a content script must be considered untrusted.

Chrome's security guidance explicitly recommends validating and sanitizing message input because content-script messages can be crafted by an attacker. ([Chrome for Developers][8])

---

# 74. Message Validation

Every message must validate:

```text
type
payload shape
sessionId
elementId
selector
command parameters
```

before execution.

---

# 75. Unknown Message Types

Unknown commands must be rejected:

```text
UNKNOWN_COMMAND
```

Never:

```text
try to interpret
```

unknown payloads dynamically.

---

# 76. Message Allowlist

The service worker should maintain an explicit command allowlist.

Example:

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

Anything else is rejected.

---

# 77. Session Validation

A command containing:

```text
sessionId = A
```

must not modify:

```text
session B
```

This is mandatory for tab isolation.

---

# 78. Element ID Validation

The extension must verify that:

```text
elementId
```

belongs to the active session.

An attacker must not be able to fabricate:

```text
element-999999
```

and cause an unrelated operation.

---

# 79. Selector Validation at Message Boundary

Even if the selector was previously generated by NewsClean, it should be validated again when crossing a privileged boundary.

Defense in depth:

```text
UI
 ↓
Message validation
 ↓
Domain validation
 ↓
DOM operation
```

---

# 80. Error Messages

Security-sensitive errors should not expose:

```text
internal stack traces
extension filesystem paths
secret configuration
```

to the webpage.

User-facing errors should be concise.

---

# 81. Exception Isolation

A malformed page must never crash the entire extension architecture.

Example:

```text
DOM Inspector error
```

should become:

```text
Inspector unavailable for this element
```

rather than:

```text
Service Worker failure
```

---

# 82. Service Worker Isolation

Privileged operations should remain in the extension service worker where appropriate.

Examples:

```text
storage
download
cross-context coordination
permission-sensitive operations
```

The content script should not receive unnecessary privileges.

---

# 83. Content Script Principle

The content script should primarily perform:

```text
DOM observation
DOM inspection
DOM cleanup execution through engine
overlay rendering
page-local operations
```

It should not own:

```text
persistent settings
download history
external synchronization
privileged API credentials
```

---

# 84. Service Worker Principle

The service worker should coordinate:

```text
sessions
messages
storage
presets
downloads
```

without becoming a second DOM engine.

---

# 85. UI Security

The NewsClean UI itself is an extension surface.

Therefore:

```text
page data
→ text
→ validated state
→ safe UI rendering
```

never:

```text
page data
→ raw HTML
→ NewsClean UI
```

---

# 86. Shadow DOM as UI Boundary

The UI should preferably be mounted inside a Shadow Root.

This reduces the ability of the target website's CSS to interfere with NewsClean controls.

It also reduces accidental style leakage in the opposite direction.

---

# 87. Web Accessible Resources

NewsClean should minimize `web_accessible_resources`.

Chrome notes that exposing extension resources to webpages makes them detectable and increases potential attack surface. ([Chrome for Developers][4])

Therefore:

```text
No web-accessible resources
```

should be the default unless a specific feature requires them.

---

# 88. External Fonts

The extension should avoid loading remote fonts.

Prefer:

```text
system fonts
```

or fonts bundled inside the extension if licensing permits.

This improves:

```text
security
performance
determinism
```

---

# 89. External Icons

Do not load icons from:

```text
unpkg
jsDelivr
Google Fonts
remote CDN
```

at runtime.

Icons should be bundled.

---

# 90. Third-Party Libraries

Third-party dependencies must be:

```text
audited
pinned
bundled
```

Avoid unnecessary dependencies in the content script because it operates directly alongside untrusted page content.

---

# 91. Dependency Policy

Every dependency must answer:

```text
Why is it required?
Can the browser API replace it?
Does it execute dynamic code?
Does it access the network?
Does it increase bundle size?
```

---

# 92. Supply Chain Security

The build process should use:

```text
lockfile
pinned versions
dependency audit
reproducible builds where practical
```

Avoid installing packages dynamically at runtime.

---

# 93. Build Artifacts

The production extension should contain only required artifacts.

Avoid shipping:

```text
source maps
test fixtures
debug scripts
development servers
unused binaries
```

unless intentionally required.

---

# 94. Development Server

Local development may use:

```text
localhost
127.0.0.1
```

but production must not depend on a development server.

Chrome's MV3 CSP allows certain localhost sources for unpacked extensions, but production extension logic should remain self-contained. ([Chrome for Developers][1])

---

# 95. Debug Mode

A development-only debug mode may expose:

```text
DOM diagnostics
message logs
engine timings
preset validation
```

But debug mode must not weaken security invariants.

Specifically:

```text
No eval
No remote script
No arbitrary code execution
```

even in development.

---

# 96. Logging

Production logs should not contain:

```text
article body
selected text
cookies
authentication tokens
complete HTML
```

Prefer:

```text
sessionId
event type
duration
error code
```

---

# 97. Debug Logging

Development logging may include selector information.

However:

```text
selector
≠
article content
```

Keep logs minimal.

---

# 98. Error Reporting

MVP should not send errors to a remote telemetry service.

If remote diagnostics are introduced later:

```text
opt-in
anonymized
no article content
no URL unless necessary
```

must be enforced.

---

# 99. Browser Lifecycle

Chrome Manifest V3 uses service workers instead of persistent background pages. Service workers are event-driven and may stop when idle. ([Chrome for Developers][9])

Therefore NewsClean must not rely on:

```text
global in-memory service-worker state
```

remaining alive indefinitely.

---

# 100. Service Worker State

Important persistent runtime state should be stored in:

```text
storage.session
```

or reconstructed when necessary.

Short-lived execution state may remain in memory.

---

# 101. Long-Running Capture

The Capture Engine must account for service-worker lifecycle.

A large capture must not assume that a single background execution context remains alive indefinitely.

The architecture should keep the actual page-local capture process close to the tab/content runtime where appropriate.

---

# 102. Abort Handling

Every long-running operation should support cancellation where possible:

```text
freeze
extraction
preset validation
capture
export
```

This prevents stale operations from continuing after the user changes context.

---

# 103. Tab Closure

If the active tab closes:

```text
Session
→ CANCELLED
```

All page references must become invalid.

---

# 104. Navigation Race

Potential race:

```text
Article A
 ↓
Capture started
 ↓
User navigates to Article B
```

The capture operation must verify that:

```text
sessionId
tabId
page context
```

still correspond to the intended session.

If not:

```text
CAPTURE_CANCELLED
```

---

# 105. Stale Async Operations

Every asynchronous operation should validate its current context before committing results.

Example:

```text
Extraction A starts
↓
Navigation
↓
Extraction A finishes
```

Result A must not overwrite:

```text
Extraction B
```

---

# 106. Race Prevention

Operations should use:

```text
sessionId
operationId
```

where necessary.

This prevents:

```text
old operation
→ new session
```

cross-contamination.

---

# 107. Page Reload

Reload invalidates page-local state.

NewsClean must create:

```text
new session
```

rather than attempting to resurrect stale DOM references.

---

# 108. Browser Back/Forward

Back/Forward navigation follows the same principle:

```text
new document
→ new session
```

The persistent preset remains available.

---

# 109. Multiple Tabs

Each tab must be isolated.

Example:

```text
Tab 1
example.com
Session A

Tab 2
example.com
Session B
```

Both may use the same preset, but:

```text
cleanup A ≠ cleanup B
```

---

# 110. Multiple Windows

The same tab-isolation principle applies across browser windows.

---

# 111. Permission Failure

If a permission required for a feature is unavailable:

```text
feature unavailable
```

rather than:

```text
extension crash
```

Example:

```text
PNG download permission unavailable.

You can still capture and use the browser's save workflow.
```

where technically possible.

---

# 112. Graceful Degradation

NewsClean should degrade in this order:

```text
Full workflow
      ↓
Manual cleanup
      ↓
Manual extraction
      ↓
Visible capture
```

A failure in one advanced feature must not unnecessarily destroy the entire workflow.

---

# 113. Security and UX Balance

Security controls should not make the tool unusable.

The correct balance is:

```text
Strict technical boundaries
+
simple operator experience
```

For example:

```text
Preset contains invalid selector
```

should result in:

```text
Preset partially available
```

rather than a technical stack trace.

---

# 114. Browser Constraint Matrix

| Capability                     |      MVP | Constraint                                      |
| ------------------------------ | -------: | ----------------------------------------------- |
| Inspect DOM                    |      Yes | Content script / page access                    |
| Delete DOM elements            |      Yes | Page DOM only                                   |
| Hide elements                  |      Yes | Page DOM only                                   |
| Freeze page                    |      Yes | Browser/page behavior limitations               |
| Article extraction             |      Yes | DOM-dependent                                   |
| Presets                        |      Yes | Local configuration                             |
| PNG capture                    |      Yes | Browser capture constraints                     |
| Full-page capture              |      Yes | Requires segmentation/stitching where necessary |
| Cross-origin iframe inspection |       No | Same-origin/browser restrictions                |
| Chrome internal pages          |       No | Browser restriction                             |
| Remote code execution          |    Never | MV3 security restriction                        |
| Arbitrary page JS execution    |    Never | Security invariant                              |
| Persistent article storage     |       No | Privacy                                         |
| Remote analytics               |       No | Privacy                                         |
| Cookie access                  |       No | Not required                                    |
| Broad host permissions         |    Avoid | Least privilege                                 |
| `downloads` permission         | Optional | Only if API is used                             |

---

# 115. Manifest Security Baseline

Conceptually:

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

The final manifest must be generated only after the implementation documents determine exactly which Chrome APIs are required.

---

# 116. Permission Decision

The architecture should prefer:

```text
activeTab
```

over:

```text
<all_urls>
```

where compatible with the desired activation model.

If automatic site presets require page access before explicit activation, that requirement must be evaluated separately rather than silently expanding permissions.

---

# 117. Security Review Gate

Before production release, the extension must pass:

```text
Manifest review
Dependency audit
CSP review
Message validation review
Storage review
Preset security review
DOM injection review
Capture permission review
Download filename review
Privacy review
```

---

# 118. Security Test Categories

The automated test suite should include:

```text
Malformed selector
Malformed preset
Malicious class name
Malicious article title
HTML injection
Script injection
Malformed message
Unknown command
Wrong session ID
Wrong tab ID
Stale element reference
Navigation during capture
Navigation during extraction
Storage corruption
Preset schema mismatch
Invalid download filename
Unsupported page
Cross-origin iframe
```

---

# 119. XSS Test

Given:

```html
<h1>
<img src=x onerror="alert(1)">
</h1>
```

NewsClean UI must display the content as data.

It must never execute:

```text
alert(1)
```

---

# 120. Preset Injection Test

Given:

```json
{
  "selector": ".ad",
  "action": "DELETE",
  "script": "alert(1)"
}
```

the preset validator must reject the configuration.

---

# 121. Message Injection Test

Given:

```json
{
  "type": "EXECUTE_CODE",
  "payload": {
    "code": "..."
  }
}
```

the message router must return:

```text
UNKNOWN_COMMAND
```

---

# 122. Session Isolation Test

Given:

```text
Session A
element-001

Session B
element-001
```

a command from Session A must never affect Session B.

---

# 123. Navigation Security Test

Given:

```text
Article A
→ cleanup
→ navigation
→ Article B
```

NewsClean must not execute Article A's cleanup references against Article B.

---

# 124. Storage Poisoning Test

Given corrupted stored preset data:

```text
invalid schema
invalid selector
invalid action
unexpected fields
```

the extension must:

```text
reject
or migrate safely
```

without executing anything.

---

# 125. Capture Security Test

The capture output must not contain:

```text
NewsClean toolbar
Inspector overlay
selection outline
toast
modal
```

unless explicitly requested as page content.

---

# 126. Filename Security Test

Given article title:

```text
../../../../secret
```

the generated filename should become something like:

```text
secret.png
```

or another sanitized basename.

Never:

```text
../../../../secret.png
```

---

# 127. Dependency Security Gate

Before every production release:

```text
npm audit / equivalent
```

should be evaluated.

Critical vulnerabilities in runtime dependencies must block release until resolved or formally accepted.

---

# 128. No Security Bypass Features

NewsClean must not evolve into a tool for bypassing:

```text
paywalls
authentication
CAPTCHA
anti-bot systems
access controls
browser security boundaries
```

The product's purpose is:

```text
editorial cleanup
+
visual capture
```

not access circumvention.

---

# 129. Security Invariants

The following are hard requirements:

```text
1. Manifest V3.
2. No eval().
3. No new Function().
4. No remote executable code.
5. No arbitrary JavaScript from presets.
6. No arbitrary JavaScript from page content.
7. Content scripts use isolated worlds by default.
8. Privileged operations remain outside the page context.
9. Messages are validated.
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

---

# 130. Security Architecture

The final security model is:

```text
                         CHROME
                           │
                 ┌─────────┴─────────┐
                 │                   │
                 ▼                   ▼
          SERVICE WORKER        CONTENT SCRIPT
          TRUSTED CONTEXT       ISOLATED WORLD
                 │                   │
                 │                   │
        ┌────────┼────────┐          │
        │        │        │          │
     Storage   Presets  Download     │
        │        │        │          │
        └────────┴────────┘          │
                 │                   │
                 └─────────┬─────────┘
                           │
                     VALIDATED MSG
                           │
                           ▼
                 ┌──────────────────┐
                 │  NEWS WEB PAGE   │
                 │    UNTRUSTED     │
                 └──────────────────┘
```

The browser page is the least trusted component.

---

# 131. Final Security Principle

NewsClean should operate under one fundamental assumption:

> **The page is content, not code.**

An article title is content.

A CSS selector is data.

A preset is configuration.

A DOM node is a temporary reference.

A screenshot is an output asset.

None of these should become executable logic.

This single principle prevents a large class of vulnerabilities while keeping the architecture clean.

---

# 132. Final Browser Principle

The second fundamental principle is:

> **Use Chrome's permission and isolation model rather than fighting it.**

NewsClean should build around:

```text
Manifest V3
+
isolated content scripts
+
least-privilege permissions
+
validated messaging
+
local storage
+
browser-native download/capture mechanisms
```

rather than attempting to bypass browser constraints. Chrome's current extension platform is explicitly designed around these security boundaries. ([Chrome for Developers][1])

---

# 133. Final Architecture Constraint

Security must not become a separate subsystem bolted onto the product later.

It is a constraint on every engine:

```text
Freeze Engine
→ safe page manipulation

DOM Inspector
→ safe DOM data

Cleanup Engine
→ validated references

Extraction Engine
→ untrusted content

Preset System
→ data-only configuration

Capture Engine
→ validated target

Export Engine
→ sanitized filename

Messaging
→ explicit contracts

Storage
→ validated persistence
```

---

# 134. Production Readiness Gate

NewsClean is not production-ready until:

```text
DOM security
        ✓

Preset security
        ✓

Message validation
        ✓

Permission minimization
        ✓

CSP
        ✓

Storage isolation
        ✓

Capture isolation
        ✓

Navigation/session isolation
        ✓

Dependency audit
        ✓

Privacy review
        ✓
```

are all explicitly verified.

---

# 135. Next Document

`13-MESSAGING.md` — Extension Messaging & Communication Protocol

وسيكون هذا المستند هو العقد التقني بين الطبقات التي حددناها حتى الآن:

```text
Chrome Tab
    │
    ▼
Content Script
    │
    │  validated messages
    ▼
Service Worker
    │
    ├── Session Manager
    ├── Preset Repository
    ├── Storage
    └── Export
```

وسنحدد فيه بدقة:

```text
Message Envelope
Command Types
Event Types
Request / Response
Correlation IDs
Session Isolation
Tab Isolation
Error Protocol
Timeouts
Cancellation
Content Script ↔ Service Worker
UI ↔ Service Worker
Capture Messaging
Preset Messaging
Lifecycle Events
```

