# Chrome Permissions

Every permission in `manifest.json` is justified below. Parotia requests only what it needs — no more.

---

## Required Permissions

### `activeTab`

**What it does:** Grants temporary access to the tab the user explicitly clicks on.

**Why it's needed:** When the user clicks the Parotia toolbar icon, we need to inject our content script into that specific tab. `activeTab` provides this without requiring `<all_urls>` host permission.

**Without it:** We would need `"host_permissions": ["<all_urls>"]` which requests access to every website — a much broader and more invasive permission.

---

### `scripting`

**What it does:** Allows programmatic injection of content scripts via `chrome.scripting.executeScript()`.

**Why it's needed:** Parotia injects its content runtime only when the user activates it, not on every page load. This is more efficient and respectful than declaring `content_scripts` in the manifest.

**Without it:** We would have to use `content_scripts` in the manifest, which injects on every matching page automatically — wasteful and privacy-invasive.

---

### `storage`

**What it does:** Provides access to `chrome.storage.local` for key-value storage.

**Why it's needed:**
- Staging large capture image data between the content script, worker and editor without repeatedly copying it through runtime messages
- Persisting tab/session ownership in `chrome.storage.session` across MV3 worker suspension
- Cleaning expired/orphaned staging records after interruption

**Without it:** full-page assembly and the one-time editor handoff would not have a reliable lifecycle-safe transfer channel.

---

### `tabs`

**What it does:** Provides access to `chrome.tabs.get()`, `chrome.tabs.setZoom()`, `chrome.tabs.getZoom()`.

**Why it's needed:** Parotia verifies that persisted session owners and editor tabs still exist. Full-page capture may temporarily zoom out only when the native page would exceed Chromium's maximum canvas dimension. Element capture does not change zoom.

**Without it:** restart-safe tab ownership checks and the oversized full-page fallback would not be available.

---

### `unlimitedStorage`

**What it does:** Removes the 5MB default limit on `chrome.storage.local`.

**Why it's needed:** Full-page captures at 2x DPR can produce data URLs exceeding 5MB. This permission allows staging these large images temporarily during the capture pipeline.

**Without it:** Full-page captures of long articles would fail with `QUOTA_BYTES` errors.

**Note:** Data is staged temporarily and cleaned up immediately after download. No persistent large data is stored.

---

### `downloads`

**What it does:** Provides access to `chrome.downloads.download()` for saving PNG files.

**Why it's needed:** MV3 service workers cannot call `permissions.request()` (only extension pages may). The permission must be declared upfront in the manifest for the download to work without user confirmation on every capture.

**Without it:** the editor could not save the final PNG through the extension-controlled download path.

**Note:** This permission is used only for saving captured PNG files. No files are uploaded or downloaded from remote servers.

---

## Permissions NOT Requested

These permissions are intentionally **not** requested:

| Permission | Why Not |
|------------|---------|
| `<all_urls>` | `activeTab` provides temporary access only when clicked |
| `webRequest` | No network interception needed |
| `cookies` | No cookie access needed |
| `history` | No browsing history access |
| `notifications` | No system notifications |
| `clipboardWrite` | No clipboard access needed |
| `management` | No extension management |
| `nativeMessaging` | No native messaging |

---

## Manifest Permissions Summary

```json
{
  "permissions": [
    "activeTab",      // Temporary access to clicked tab
    "scripting",      // Inject content script on demand
    "storage",        // Stage capture data temporarily
    "tabs",           // Live-tab checks + oversized full-page zoom fallback
    "unlimitedStorage", // Large capture data staging
    "downloads"       // Save PNG files
  ]
}
```

**Total: 6 permissions** — all justified, all minimal, all essential.

## Web-accessible resources

Only the toolbar page, editor page and their hashed Vite assets are exposed to HTTP(S) pages. The toolbar/editor must be frameable inside the user-activated tab. No content/background source file or test fixture is web-accessible.
