<div align="center">

<img src="Parotia.svg" alt="Parotia Logo" width="200" />

# Parotia

**clean the stage. keep the story.**

Freeze, inspect, clean and capture news pages as broadcast-ready PNGs.

---

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)](https://developer.chrome.com/docs/extensions/)
[![MV3](https://img.shields.io/badge/MV3-Support-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](#license)
[![Tests](https://img.shields.io/badge/Tests-247%20passing-brightgreen)](#testing)

</div>

---

## What is Parotia?

Parotia is a Chrome extension built for editorial teams and journalists who need clean, professional screenshots of news articles. It lets you **freeze** a live webpage, **remove** unwanted elements (ads, banners, cookie notices, popups), and **capture** the cleaned result as a high-resolution PNG — ready for broadcast or print.

**No servers. No tracking. No data leaves your browser.**

---

## Features

### Freeze
Lock the page against live updates, ad refreshes, and DOM mutations. What you see is what you capture.

### Inspect & Pick
Hover over any element to highlight it. Pick elements to understand the page structure before cleaning.

### Clean
Delete unwanted elements with a single click. Every delete is reversible with full Undo/Redo support and a visual action log.

### Capture
Export the cleaned page as a PNG in multiple modes:

| Mode | Description |
|------|-------------|
| **Full Page** | Viewport slicing + stitching for long articles |
| **Visible Area** | Capture what's currently visible |
| **Element** | Isolate and capture a specific element with zoom |
| **Free Select** | Draw a custom region on the frozen page |

### Live Progress
Watch capture progress in real-time — the toolbar shows `Capture rendering 2/4 (50%)` while it works.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift+Alt+F` | Freeze / Unfreeze the page |
| `Shift+Alt+P` | Toggle element picker |
| `Escape` | Cancel current pick |
| `Delete` / `Backspace` | Delete the picked element |

---

## Installation

### Quick Install (Windows)

1. Download or clone this repository
2. Run **`install.bat`**
3. Chrome opens automatically — follow the 4 steps on screen

### Manual Install (All Platforms)

```bash
git clone https://github.com/wittybrandcode/Parotia.git
cd Parotia
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Usage

1. Open any news article
2. Click the Parotia icon or let the injected toolbar start automatically
3. **Freeze** the page (click the Parotia logo)
4. **Pick** and **Delete** unwanted elements
5. **Capture** the cleaned page as PNG
6. Find the exported file in your Downloads folder

---

## Architecture

```
src/
├── shared/          Types, constants, pure utilities
├── background/      MV3 service worker (no DOM access)
├── content/         Page runtime (content script)
│   ├── freeze/      Stability monitor + page locking
│   ├── inspector/   Element highlighting + picking
│   ├── cleanup/     Element deletion engine
│   ├── mutation/    DOM mutation tracking + history
│   ├── matching/    Similar element detection
│   ├── extraction/  Content extraction scoring
│   ├── capture/     Slicing, stitching, element capture
│   ├── selection/   Free-select region capture
│   ├── keyboard/    Shortcut management
│   └── overlay/     UI overlay management
├── ui/              React toolbar + options page (Vite)
scripts/             Build tooling (esbuild, icons, manifest)
tests/               Vitest suites (happy-dom) + Playwright E2E
```

### Security

- **Command allowlist** — only typed commands are accepted
- **Payload validation** — Zod schemas at every boundary
- **Origin check** — `postMessage` restricted to extension origin
- **Minimal permissions** — uses `activeTab`, `scripting`, `storage`, `downloads`
- **No network activity** — everything runs locally

---

## Scripts

```bash
npm run build          # Build everything (content + background + UI + icons + manifest)
npm run typecheck      # TypeScript type check
npm run lint           # ESLint (zero warnings)
npm run test           # Run all tests (Vitest + happy-dom)
npm run test:coverage  # Run with coverage thresholds
npm run test:e2e       # Playwright smoke test
npm run dev:ui         # Vite dev server for toolbar UI
```

---

## Testing

| Framework | Purpose |
|-----------|---------|
| **Vitest** | Unit & integration tests (happy-dom) |
| **Playwright** | E2E smoke test (real Chromium extension) |
| **v8 coverage** | Enforced thresholds (lines ≥80%, branches ≥75%) |

```bash
npm run test           # 247 tests across 24 files
npm run test:coverage  # With coverage report
npm run test:e2e       # Requires build first
```

---

## Tech Stack

- **TypeScript** — strict mode
- **React 18** — toolbar UI
- **Vite** — UI bundler
- **esbuild** — content/background bundler
- **Zod** — runtime validation
- **Lucide React** — icons
- **Vitest** — testing
- **Playwright** — E2E testing
- **ESLint** — linting

---

## Documentation

Complete technical documentation is in the [`docs/`](./docs/) folder:

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design, module structure, data flow |
| [Security](./docs/SECURITY.md) | Security model, validation, CSP, threat mitigation |
| [Permissions](./docs/PERMISSIONS.md) | Why each Chrome permission is needed |
| [Testing](./docs/TESTING.md) | Test strategy, coverage, writing new tests |
| [Build System](./docs/BUILD.md) | Build pipeline, scripts, configuration |
| [Keyboard Shortcuts](./docs/KEYBOARD-SHORTCUTS.md) | Complete shortcut reference |
| [Contributing](./docs/CONTRIBUTING.md) | How to contribute, code conventions |
| [Changelog](./docs/CHANGELOG.md) | Version history and release notes |

---

## License

MIT

---

<div align="center">

**Parotia** — *clean the stage. keep the story.*

</div>
