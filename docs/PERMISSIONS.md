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
- Staging large capture image data between the content script and service worker (base64 data URLs for full-page captures can exceed message size limits)
- Cleaning up orphaned data on service worker restart

**Without it:** Full-page captures would fail because data URLs cannot be passed through `chrome.runtime.sendMessage()` (size limit ~6MB).

---

### `tabs`

**What it does:** Provides access to `chrome.tabs.get()`, `chrome.tabs.setZoom()`, `chrome.tabs.getZoom()`.

**Why it's needed:** During element capture, Parotia temporarily sets the tab zoom to 2x for higher resolution. After capture, it restores the original zoom level.

**Without it:** Element capture would produce lower resolution images. The zoom get/set operations require the `tabs` permission.

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

**Without it:** Every capture would trigger a browser download confirmation dialog, breaking the seamless workflow.

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
    "tabs",           // Zoom get/set for element capture
    "unlimitedStorage", // Large capture data staging
    "downloads"       // Save PNG files
  ]
}
```

**Total: 6 permissions** — all justified, all minimal, all essential.
