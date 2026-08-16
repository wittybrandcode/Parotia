# NewsClean — Product Requirements Document (PRD)

**Document ID:** PRD-001  
**Version:** 0.1.0  
**Status:** Draft / Foundation  
**Product Type:** Chrome Extension  
**Primary Domain:** Editorial / Newsroom / Broadcast Production

## 1. Product Definition

NewsClean is a Chrome extension for newsrooms and broadcast production teams: freeze a webpage, inspect its DOM structure, selectively remove or hide unwanted components, preserve relevant editorial content, and export the result as a high-resolution PNG suitable for broadcast graphics, newsroom systems, presentations, documentation, and editorial workflows.

NewsClean is not intended as a general-purpose ad blocker; its purpose is **editorial web extraction and visual capture**.

Core workflow:

```text
OPEN → FREEZE → INSPECT → CLEAN → PRESERVE → COMPOSE → CAPTURE → EXPORT
```

## 2. Problem Statement

Newsroom operators frequently need to capture information from online news websites for television broadcasts, editorial meetings, reports, social content, archives, and visual references. Modern news websites commonly contain:

- Advertising
- Cookie consent interfaces
- Newsletter prompts
- Social widgets
- Recommendation modules
- Related articles
- Sidebars
- Embedded videos
- Autoplay media
- Sticky navigation
- Floating buttons
- Subscription prompts
- Promotional banners
- Tracking-related UI
- Dynamic content
- Comments
- Unnecessary navigation elements

A normal browser screenshot captures all of this; manual cleanup through image-editing software is slow and introduces unnecessary production steps. The newsroom needs a tool that cleans the webpage itself before capture.

## 3. Product Objective

Provide the fastest possible workflow from a messy web page to a clean editorial capture without leaving the browser. The target workflow requires minimal technical knowledge and is usable by journalists, editors, producers, graphic designers, and newsroom operators.

## 4. Product Goals

### G1 — Freeze the page
Stop the webpage from continuing to change while the operator performs cleanup; provide a controlled page state suitable for inspection.

### G2 — Inspect webpage structure
Allow the operator to visually inspect HTML elements directly from the rendered webpage: HTML tag, ID, classes, CSS selector, element dimensions, parent element, child elements.

### G3 — Remove unwanted content
Allow the operator to delete or hide specific elements, e.g. `.ad`, `.ads`, `.sidebar`, `.cookie-banner`, `.social`, `.related`, `.comments`, `iframe`, `video`.

### G4 — Preserve editorial content
Make it easy to preserve website identity, logo, header, article title, hero image, article body, publication date, author, and source information.

### G5 — Undo destructive operations
Every cleanup operation must be reversible via Undo/Redo without reloading the webpage.

### G6 — Reuse cleanup rules
Operators should be able to save cleanup rules for recurring websites; a preset may contain selectors such as `.ads`, `.sidebar`, `.related`, `.social`, `.comments`.

### G7 — Export production-ready captures
The final cleaned page must be exportable as a high-quality image. Initial target: **PNG**. Future formats: JPEG, WebP, PDF.

### G8 — Minimize workflow time
Reduce the process from Browser → Screenshot → Photoshop / After Effects → Manual cleanup → Export to Browser → NewsClean → Clean → Capture.

## 5. Non-Goals

The first version must avoid becoming an unnecessarily broad browser automation platform. Outside the MVP:

- **General-purpose ad blocking** — does not attempt to replace uBlock Origin, AdGuard, or browser-level content blockers.
- **Permanent website modification** — cleanup applies to the current working session unless explicitly saved as a preset.
- **Server-side scraping** — the MVP must not require a backend server.
- **Automatic article rewriting** — must not alter article text.
- **Automatic translation** — outside the initial product scope.
- **AI-dependent operation** — the core product must work without AI; AI may later improve article detection and cleanup recommendations but must not be a dependency for the fundamental workflow.

## 6. Target Users

- **Primary — Newsroom Operator:** quickly capture an article for broadcast or editorial use (Find article → Clean page → Capture → Send to production).
- **Secondary — Graphic Designer:** clean website references for broadcast graphics, infographics, backgrounds, screens, editorial packages, motion graphics.
- **Secondary — Journalist / Editor:** clean visual representation of an article for editorial meetings, internal documentation, research, rundowns, reports.
- **Secondary — Producer:** fast visual material for television segments, editorial packages, breaking news, interviews, social media production.

## 7. Core Product Concept

NewsClean is based on five modular engines; the UI must orchestrate them rather than contain their core logic:

```text
Freeze Engine → DOM Inspector → Cleanup Engine → Capture Engine → Preset Engine
```

## 8. Primary User Flow

### 8.1 Activation
Open a news webpage → activate NewsClean from the Chrome toolbar → the extension opens its control interface. Primary action: **Start Cleaning**.

### 8.2 Freeze
The system enters a controlled state (visual indicator: `FROZEN`). It should stop pending page loading where appropriate, prevent unnecessary new visual content from appearing, disable animations where possible, stabilize the DOM, and preserve the current visual state.

The implementation distinguishes **Soft Freeze** (default) and **Hard Freeze** (advanced option).

## 9. Inspection Mode

After freezing, the user activates `Inspect`. The cursor becomes an element-selection tool; hovering shows a visual overlay identifying TAG, ID, CLASS, SELECTOR, SIZE, POSITION (e.g. `DIV.article-sidebar — 320 × 850 px`).

## 10. Element Actions

- **Delete** — permanently removes the element from the current working DOM.
- **Hide** — applies a reversible visibility state.
- **Keep** — marks the element as editorially relevant.
- **Select Parent** — moves selection to the nearest parent container.
- **Select Children** — allows selection from descendant elements.
- **Delete All Matching** — removes every element matching the generated selector; important for repeated advertisements.

## 11. Selector Engine

Minimum support: tag, ID, class, attribute, and CSS selectors (e.g. `div`, `#sidebar`, `.advertisement`, `[data-ad]`, `aside.sidebar`). Generate a stable selector whenever possible; **prioritize stability over raw DOM specificity** (avoid `body > div:nth-child(4) > div:nth-child(2)` when `.article-sidebar` is available).

## 12. Cleanup Modes

- **Delete Mode** — the operator explicitly removes unwanted elements (Select → Delete).
- **Keep Mode** — the operator identifies the primary article container; the system removes or hides everything outside it. Intended to become one of the product's strongest productivity features.

## 13. Smart Cleanup

Optional `Clean Page` action identifies common noise patterns: advertisement, cookie banner, newsletter, social, recommendation, related content, comments, video, sidebar, sticky UI, promotional content, navigation.

The system must not automatically delete everything it detects; it produces a reviewable proposal (e.g. "12 elements detected" grouped by category, with a `[Review Cleanup]` action). The user remains in control.

## 14. Article Extraction

The system should attempt to identify website, logo, article title, hero image, article body, author, and publication date. Extraction must be non-destructive and used to assist the user, never to silently replace the original webpage.

## 15. Composition Mode

After cleanup, the user may enter `Compose`, a controlled presentation layer. Configurable: canvas width, canvas height, background, padding, scale, margins, alignment. Initial broadcast presets: **1920 × 1080** and **3840 × 2160**.

## 16. Capture Engine

Initial format: **PNG**. Required capture modes: Capture Visible, Capture Full Article, Capture Selection, Capture Composition. The engine must account for devicePixelRatio, CSS pixel dimensions, viewport dimensions, and full-page dimensions to avoid low-resolution screenshots unsuitable for broadcast production.

## 17. Export Requirements

The exported image must preserve text readability, image quality, and the cleaned layout; and must avoid browser UI, NewsClean overlays, inspector controls, selection outlines, and temporary cleanup UI. The final export must represent only the intended editorial content.

## 18. Undo / Redo

All destructive DOM operations must generate a reversible command (Execute → Record State → Undo Stack). The history remains available until the session is closed or explicitly reset.

## 19. Preset System

A preset is a reusable cleanup strategy, stored locally in the MVP.

```json
{
  "name": "Example News Site",
  "hostname": "example.com",
  "remove": [".advertisement", ".sidebar", ".related", ".comments"],
  "keep": [".site-header", ".article"]
}
```

Required operations: Create, Edit, Delete, Duplicate, Export, Import, Apply.

## 20. News Mode

A dedicated workflow intended to become the fastest path for newsroom users:

```text
Freeze → Detect Article → Detect Noise → Review → Clean → Compose → Capture
```

## 21. Keyboard Shortcuts

Keyboard-first operation:

| Key | Action |
| --- | --- |
| Esc | Exit current mode |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Delete | Delete selected element |
| H | Hide selected element |
| K | Keep selected element |
| I | Inspector |
| C | Capture |

Final shortcuts must be reviewed against Chrome and operating-system conflicts.

## 22. UI Requirements

Compact and production-oriented. Primary toolbar: Freeze, Inspect, Clean, Keep, Undo, Redo, Compose, Capture, Preset.

- The UI must not dominate the article.
- The inspector appears contextually, not as a permanent large panel.
- Support Light and Dark UI; dark mode suits newsroom environments.

## 23. Browser Compatibility

MVP target: **Google Chrome and Chromium-based browsers**, **Manifest V3**. The architecture should avoid dependencies that make migration to other Chromium browsers unnecessarily difficult.

## 24. Privacy Requirements

NewsClean should operate locally. The MVP must not send webpage contents to an external server or upload article text, images, cookies, page HTML, or browsing history — unless a future feature explicitly requires external processing and the user explicitly enables it. Local processing is a core product principle.

## 25. Security Requirements

Minimize privileges; permissions must be justified by actual functionality. The product must not inject unnecessary remote scripts, collect browsing history, track visited websites, upload webpage content, or modify permanent website data. The extension should operate only on the active page when possible.

## 26. Performance Requirements

| Target | Value |
| --- | --- |
| Inspector activation | < 100 ms perceived response |
| Element hover | near-immediate |
| Element selection | < 100 ms |
| Undo/Redo | near-immediate |
| Capture preparation | < 1 s for normal articles |

Exact benchmarks will be established during implementation.

## 27. Failure Handling

- If the page cannot be frozen safely, inform the user (e.g. "This page contains dynamic content that could not be fully frozen. Soft Freeze is active. Some elements may continue changing.").
- If capture fails, suggest Capture Visible, Capture Selection, or disabling Hard Freeze.
- The extension must never silently produce a corrupted capture.

## 28. MVP Scope

**Includes:** Chrome Manifest V3, content script, service worker, Freeze Engine, DOM Inspector, element selection, element delete, element hide, element keep, CSS selector detection, Delete All Matching, Undo/Redo, basic cleanup, basic article detection, PNG capture, local presets, basic News Mode.

**Does not require:** AI, cloud, accounts, backend, team collaboration, remote storage, PDF export, advanced composition.

## 29. Version 1.1 Candidates

Advanced composition, full article capture, preset import/export, smart cleanup, improved article extraction, broadcast templates, better selector generation, capture scaling, JPEG/WebP export.

## 30. Version 2 Candidates

AI article detection, AI cleanup suggestions, automatic website profiles, shared preset library, PDF export, editorial metadata, newsroom integration, NDI / broadcast output, direct After Effects integration. These must not influence MVP architecture unless there is a clear technical dependency.

## 31. Success Metrics

Primary KPI: **Time to Clean Capture < 30 seconds** for a normal article after the user is familiar with the tool.

Additional metrics: average cleanup actions per article, average capture time, undo rate, preset usage rate, capture success rate, number of manually removed elements. A successful product should progressively reduce the number of manual operations required per website.

## 32. Acceptance Criteria — MVP

The MVP is considered functional when an operator can:

1. Open a news webpage.
2. Activate NewsClean.
3. Freeze the current page.
4. Hover over HTML elements.
5. Identify their DOM structure.
6. Select an unwanted element.
7. Delete it.
8. Undo the deletion.
9. Delete all elements matching a selector.
10. Preserve an article container.
11. Clean common webpage noise.
12. Capture the cleaned page.
13. Export it as a high-resolution PNG.
14. Save cleanup rules as a preset.
15. Reapply the preset on the same website.

## 33. Product Principles

1. **User Control** — nothing important is deleted automatically without user visibility or a reversible action.
2. **Local First** — the webpage is processed locally whenever technically possible.
3. **DOM First** — manipulate the webpage structure rather than painting pixels over unwanted content.
4. **Reversible** — cleanup operations are undoable.
5. **Fast** — designed for newsroom production where seconds matter.
6. **Broadcast Ready** — the final result must be suitable for professional visual production.
7. **Progressive Intelligence** — manual control comes first; automation and AI come later.

## 34. One-Sentence Definition

**NewsClean turns a cluttered news webpage into a clean, controlled, broadcast-ready editorial capture directly inside Chrome.**

## 35. Architectural Direction

- **Chrome Extension** with:
  - Service Worker
  - Content Runtime — Freeze Engine, DOM Inspector, Selection Engine, Cleanup Engine, Extraction Engine, Session History
  - UI Runtime — Toolbar, Inspector, Cleanup Panel, Preset Manager, Capture UI
  - Capture Runtime — PNG Renderer
  - Local Storage — Presets / Settings

This document defines product requirements; detailed technical decisions belong to the Architecture and subsystem documents that follow.
