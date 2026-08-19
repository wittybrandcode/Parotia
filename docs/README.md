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
| [v1.1 Plan](./PLAN-V1.1.md) | Hardening plan for the next release |

---

## Quick Reference

```
Parotia Chrome Extension v1.1.3
├── Manifest V3 (MV3)
├── TypeScript (strict) + React 18 + Vite 6
├── 237 tests / 24 files / 80%+ coverage
├── Zero network activity — all local
└── MIT License
```

## Project Stats

| Metric | Value |
|--------|-------|
| Source files | 37 |
| Test files | 24 |
| Total tests | 237 |
| Test pass rate | 100% |
| Build output | ~310 KB |
| Chrome APIs used | 14 |
| Supported browsers | Chrome 120+ |
