# Build System

Parotia uses a multi-tool build pipeline: esbuild for content scripts, Vite for UI, sharp for icons, and a custom manifest generator.

---

## Build Commands

```bash
npm run build           # Full build (all steps below)
npm run build:content   # Content script → dist/content/index.js
npm run build:background # Service worker → dist/background/service-worker.js
npm run build:ui        # React toolbar + options → dist/ui/
npm run build:icons     # SVG → PNG icons (16/32/48/128)
npm run build:manifest  # Generate dist/manifest.json
```

---

## Pipeline

```
npm run build
  │
  ├── 1. build:content (esbuild)
  │   └── src/content/index.ts → dist/content/index.js (90 KB)
  │
  ├── 2. build:background (esbuild)
  │   └── src/background/service-worker.ts → dist/background/service-worker.js (24 KB)
  │
  ├── 3. build:ui (Vite)
  │   └── src/ui/index.html + options.html → dist/ui/ + dist/ui/assets/
  │
  ├── 4. build:icons (sharp)
  │   └── src/ui/favicon.svg → dist/icons/icon{16,32,48,128}.png
  │
  └── 5. build:manifest (Node.js)
      └── scripts/build-manifest.mjs → dist/manifest.json
```

---

## esbuild (Content & Background)

`scripts/build-esm.mjs` bundles TypeScript sources into IIFE format for MV3:

```bash
node scripts/build-esm.mjs content     # Content runtime
node scripts/build-esm.mjs background  # Service worker
```

**Path aliases** resolved at build time:

| Alias | Resolves To |
|-------|-------------|
| `@shared/*` | `src/shared/*` |
| `@content/*` | `src/content/*` |
| `@background/*` | `src/background/*` |
| `@ui/*` | `src/ui/*` |

**Note:** Content script imports `sliceMath.ts` from the shared module — esbuild resolves this cross-context dependency automatically.

---

## Vite (UI)

`vite.config.ts` configures a multi-page build:

- **Root:** `src/ui/`
- **Entry points:** `index.html` (toolbar) + `options.html` (settings)
- **Output:** `dist/ui/`
- **Plugins:** `@vitejs/plugin-react`

---

## Icon Generation

`scripts/generate-icons.mjs` uses sharp to rasterize the SVG logo:

```
src/ui/favicon.svg → sharp(384 DPI) → resize → PNG
  ├── dist/icons/icon16.png   (725 bytes)
  ├── dist/icons/icon32.png   (1.5 KB)
  ├── dist/icons/icon48.png   (2.4 KB)
  └── dist/icons/icon128.png  (6.8 KB)
```

Also writes to `public/icons/` for source-of-truth tracking.

---

## Manifest Generation

`scripts/build-manifest.mjs` generates `dist/manifest.json` from:

- `package.json` → version number
- Hardcoded permissions, icons, CSP, web-accessible resources

This ensures the manifest is always in sync with the source of truth.

---

## TypeScript Configuration

`tsconfig.json` key settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true
  }
}
```

**Path aliases** mirror esbuild:

```json
{
  "paths": {
    "@shared/*": ["./src/shared/*"],
    "@content/*": ["./src/content/*"],
    "@background/*": ["./src/background/*"],
    "@ui/*": ["./src/ui/*"]
  }
}
```

---

## ESLint Configuration

`eslint.config.js` enforces:

| Rule | Setting |
|------|---------|
| `@typescript-eslint/no-unused-vars` | Error (ignore `_` prefix) |
| `@typescript-eslint/consistent-type-imports` | Enforced |
| `@typescript-eslint/no-explicit-any` | Error |

Zero warnings allowed: `npm run lint -- --max-warnings 0`.

---

## Output Structure

```
dist/
├── manifest.json           # MV3 manifest
├── background/
│   └── service-worker.js   # 24 KB
├── content/
│   └── index.js            # 90 KB
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── ui/
    ├── index.html
    ├── options.html
    └── assets/
        ├── index-*.js      # 8 KB (toolbar)
        ├── options-*.js    # 10 KB (options)
        ├── brand-*.js      # 154 KB (React + Lucide)
        ├── index-*.css     # 6 KB
        ├── options-*.css   # 4 KB
        └── favicon-*.svg   # 3 KB
```

**Total dist size:** ~315 KB

---

## Development

```bash
npm run dev:ui    # Vite dev server for toolbar UI (http://localhost:5173)
npm run test:watch  # Vitest watch mode
```

---

## CI/CD Readiness

The build pipeline is deterministic and can be integrated into CI:

```yaml
# Example GitHub Actions
- run: npm ci
- run: npm run lint
- run: npx tsc --noEmit
- run: npm run test:coverage
- run: npm run build
- run: npm run test:e2e
```
