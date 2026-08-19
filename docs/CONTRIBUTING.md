# Contributing to Parotia

Thank you for your interest in contributing to Parotia! This guide will help you get started.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Google Chrome 120+

### Setup

```bash
git clone https://github.com/wittybrandcode/Parotia.git
cd Parotia
npm install
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Edit files in `src/`
- Follow the code conventions below
- Add tests for new functionality

### 3. Verify

```bash
npm run typecheck    # TypeScript must be clean
npm run lint         # Zero warnings
npm run test         # All 247 tests must pass
npm run build        # Build must succeed
```

### 4. Commit

```bash
git add -A
git commit -m "Brief description of change"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

---

## Code Conventions

### TypeScript

- **Strict mode** — All code must pass `tsc --noEmit` with strict settings
- **No `any`** — Use proper types; `@typescript-eslint/no-explicit-any` is enforced
- **Type imports** — Use `import type` for type-only imports
- **No unused vars** — `@typescript-eslint/no-unused-vars` is an error (prefix with `_` to ignore)

### Naming

- **Files:** `camelCase.ts` for code, `PascalCase.tsx` for React components
- **Functions:** `camelCase` (e.g., `createSession`, `validatePayload`)
- **Types:** `PascalCase` (e.g., `ElementReference`, `CleanupAction`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_CANVAS_DIMENSION`)
- **Interfaces:** `PascalCase` with no `I` prefix (e.g., `Inspector`, not `IInspector`)

### File Structure

```
src/
├── shared/          Types, constants, utilities (shared between contexts)
├── background/      Service worker (NO DOM access)
├── content/         Content runtime (OWNS the page DOM)
│   ├── index.ts     Command hub (entry point)
│   └── [module]/    One directory per engine
└── ui/              React toolbar + options page
```

### Testing

- **One test file per source file** — `foo.ts` → `foo.test.ts`
- **Describe blocks** — Group related tests
- **Arrange-Act-Assert** — Clear test structure
- **Minimal mocking** — Only mock what's outside the test boundary

---

## Architecture Rules

1. **Service Worker never touches the DOM** — It coordinates; content script executes.
2. **All DOM changes go through MutationEngine** — Enables consistent undo/redo.
3. **All commands go through the allowlist** — `BACKGROUND_COMMAND_TYPES` in `messages.ts`.
4. **All boundaries validate input** — `validatePayload()` at SW and content layers.
5. **Element references are serializable** — Never store DOM node references.
6. **postMessage never uses `"*"`** — Always specify `targetOrigin`.

---

## Pull Request Guidelines

### PR Title

Use a clear, concise title:

```
Add free-select region capture
Fix gray line artifact in full-page capture
Remove unused PageIdentity type
```

### PR Description

Include:

1. **What** — Brief description of the change
2. **Why** — Motivation or bug being fixed
3. **How** — Key implementation details
4. **Testing** — How you verified the change
5. **Screenshots** — If UI changes are involved

### PR Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (zero warnings)
- [ ] `npm run test` passes (all 247 tests)
- [ ] `npm run build` succeeds
- [ ] New tests added for new functionality
- [ ] No unrelated changes included

---

## Reporting Issues

When reporting bugs, include:

1. Chrome version
2. Extension version
3. Steps to reproduce
4. Expected behavior
5. Actual behavior
6. Console errors (if any)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
