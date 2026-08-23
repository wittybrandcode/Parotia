# Security model

Parotia performs capture and editing locally. It has no analytics, remote API or remote code path.

## Trust boundaries

| Boundary | Required checks |
|---|---|
| Runtime message -> worker | command allowlist, shared payload shape, finite/positive geometry, PNG signature/size, verified session owner |
| Worker -> content | exact tab resolved from persisted session; content revalidates payload and page-owned session |
| Page -> toolbar iframe | exact extension origin, exact iframe window, accepted Parotia/legacy source discriminator |
| Editor -> worker | exact extension origin and pathname, ticket-owning tab, 48-hex capability, expiry and single consumption |

Unknown commands fail with `UNKNOWN_COMMAND`; malformed commands fail before side effects. A page session is never recovered through the currently active tab. `chrome.storage.session` ownership records are checked against live tabs after an MV3 worker restart.

## One-time editor capabilities

Captured PNGs are staged as `editor-image:<token>` with an `editor-ticket:<token>` record containing owner tab, session and expiry. The token has 192 random bits. A result is accepted only from the exact `ui/editor.html` path and the recorded tab.

The manager uses an explicit in-memory consuming set and removes the ticket/image before download, so concurrent or later replay fails even when download itself fails. Cleanup runs:

- on worker startup;
- lazily before staging/consuming;
- when the owner tab closes;
- when an expired or malformed ticket is encountered.

PNG result validation requires a correctly formed base64 data URL, PNG signature prefix and decoded size no larger than 25 MiB. Filenames are NFKC-normalized, stripped of path separators/control characters and bounded before `chrome.downloads.download`.

## DOM and capture safety

- Temporary style/attribute changes use `DomPatchLedger` and preserve CSS priority and missing-vs-present attribute state.
- Capture geometry rejects NaN/infinite/non-positive dimensions and clamps crop rectangles to decoded bitmap bounds.
- Canvas dimensions are capped at Chromium's supported limit.
- Slice finalization rejects missing painted intervals instead of silently exporting gaps.
- Media and MutationObserver waits have hard deadlines and observers are disconnected in cleanup paths.
- Closed shadow roots and cross-origin iframe DOM are never traversed.

## postMessage policy

No production `postMessage` call uses `"*"`. Toolbar bootstrap carries a trusted parent origin in the iframe hash. Receivers validate both `event.origin` and `event.source`. The `newsclean-*` source strings are accepted only as a documented 1.x compatibility alias; new senders emit `parotia-*`.

## Storage lifecycle

`chrome.storage.session` contains only tab/session ownership. `chrome.storage.local` contains preferences and short-lived base64 capture/editor data. Capture staging keys are removed after transfer, and stale/orphaned records are purged best-effort. `unlimitedStorage` prevents legitimate long captures from failing quota checks; it does not make staged data persistent.

## Threat summary

| Threat | Mitigation |
|---|---|
| Cross-tab command routing | persisted one-tab ownership, sender mismatch rejection, no active-tab fallback |
| Forged/replayed editor save | exact URL+tab capability, expiry, consume-before-download |
| Malformed capture payload | centralized discriminated validation and finite geometry |
| Path traversal | sanitized basename and fixed `.png` extension |
| Page CSS/script interference | Shadow DOM, CSP, UI exclusion markers, isolated content world |
| DOM leakage after capture | transactional exact restoration and `finally` cleanup |
| Orphaned large payloads | startup/lazy/tab-close cleanup |
| Remote code or exfiltration | self-only CSP and no network integration |

## Reporting

Do not include captured page content or stored data URLs in public reports. Provide extension version, Chrome version, command/mode and a minimal synthetic fixture.
