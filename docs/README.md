# Parotia Documentation

> **clean the stage. keep the story.**

Complete technical documentation for the Parotia Chrome extension.

---

## Table of Contents

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System design, module structure, data flow |
| [Security](./SECURITY.md) | Security model, validation, CSP, threat mitigation |
| [Permissions](./PERMISSIONS.md) | Why each Chrome permission is needed |
| [Testing](./TESTING.md) | Test strategy, coverage, writing new tests |
| [Build System](./BUILD.md) | Build pipeline, scripts, configuration |
| [Keyboard Shortcuts](./KEYBOARD-SHORTCUTS.md) | Complete shortcut reference |
| [Contributing](./CONTRIBUTING.md) | How to contribute, code conventions |
| [Changelog](./CHANGELOG.md) | Version history and release notes |

---

## Quick Reference

```
Parotia Chrome Extension v1.0.0
├── Manifest V3 (MV3)
├── TypeScript (strict) + React 18 + Vite 6
├── 208 tests / 23 files / 80%+ coverage
├── Zero network activity — all local
└── MIT License
```

## Project Stats

| Metric | Value |
|--------|-------|
| Source files | 42 |
| Test files | 25 |
| Total tests | 208 |
| Test pass rate | 100% |
| Build output | ~315 KB |
| Chrome APIs used | 16 |
| Supported browsers | Chrome 120+ |
