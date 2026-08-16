# NewsClean

## Product Requirements Document — PRD

**Document ID:** PRD-001
**Version:** 0.1.0
**Status:** Draft / Foundation
**Product Type:** Chrome Extension
**Primary Domain:** Editorial / Newsroom / Broadcast Production

---

## 1. Product Definition

NewsClean is a Chrome extension designed for newsrooms and broadcast production teams to transform cluttered online news pages into clean, controlled, publication-ready visual captures.

The product allows an operator to freeze a webpage, inspect its DOM structure, selectively remove or hide unwanted components, preserve relevant editorial content, and export the resulting page as a high-resolution PNG suitable for broadcast graphics, newsroom systems, presentations, documentation, and editorial workflows.

NewsClean is not intended to function as a general-purpose ad blocker.

Its purpose is **editorial web extraction and visual capture**.

The core workflow is:

```text
OPEN
  ↓
FREEZE
  ↓
INSPECT
  ↓
CLEAN
  ↓
PRESERVE
  ↓
COMPOSE
  ↓
CAPTURE
  ↓
EXPORT
```

---

## 2. Problem Statement

Newsroom operators frequently need to capture information from online news websites for television broadcasts, editorial meetings, reports, social content, archives, and visual references.

Modern news websites commonly contain:

* Advertising
* Cookie consent interfaces
* Newsletter prompts
* Social widgets
* Recommendation modules
* Related articles
* Sidebars
* Embedded videos
* Autoplay media
* Sticky navigation
* Floating buttons
* Subscription prompts
* Promotional banners
* Tracking-related UI
* Dynamic content
* Comments
* Unnecessary navigation elements

A normal browser screenshot captures all of this content.

Manual cleanup through image-editing software is slow and introduces unnecessary production steps.

The newsroom therefore needs a tool capable of cleaning the webpage itself before capture.

---

## 3. Product Objective

The primary objective is to provide the fastest possible workflow for producing a clean visual representation of an online news article.

The operator should be able to go from:

```text
Messy Web Page
```

to:

```text
Clean Editorial Capture
```

without leaving the browser.

The target workflow should require minimal technical knowledge and should be usable by journalists, editors, producers, graphic designers, and newsroom operators.

---

## 4. Product Goals

### G1 — Freeze the page

Stop the webpage from continuing to change while the operator performs cleanup.

The system must provide a controlled page state suitable for inspection.

### G2 — Inspect webpage structure

Allow the operator to visually inspect HTML elements directly from the rendered webpage.

The operator should be able to identify:

* HTML tag
* ID
* Classes
* CSS selector
* Element dimensions
* Parent element
* Child elements

### G3 — Remove unwanted content

Allow the operator to delete or hide specific elements.

Examples:

```text
.ad
.ads
.sidebar
.cookie-banner
.social
.related
.comments
iframe
video
```

### G4 — Preserve editorial content

The system must make it easy to preserve:

* Website identity
* Logo
* Header
* Article title
* Hero image
* Article body
* Publication date
* Author
* Source information

### G5 — Undo destructive operations

Every cleanup operation must be reversible.

The operator must be able to use:

```text
Undo
Redo
```

without reloading the webpage.

### G6 — Reuse cleanup rules

Operators should be able to save cleanup rules for recurring websites.

A preset may contain selectors such as:

```text
.ads
.sidebar
.related
.social
.comments
```

### G7 — Export production-ready captures

The final cleaned page must be exportable as a high-quality image.

Initial target:

```text
PNG
```

Future formats:

```text
JPEG
WebP
PDF
```

### G8 — Minimize workflow time

The product should reduce the process from:

```text
Browser
→ Screenshot
→ Photoshop / After Effects
→ Manual cleanup
→ Export
```

to:

```text
Browser
→ NewsClean
→ Clean
→ Capture
```

---

## 5. Non-Goals

The first version must explicitly avoid becoming an unnecessarily broad browser automation platform.

The following are outside the MVP:

### 5.1 General-purpose ad blocking

NewsClean does not attempt to replace uBlock Origin, AdGuard, or browser-level content blockers.

### 5.2 Permanent website modification

Cleanup should apply to the current working session unless explicitly saved as a preset.

### 5.3 Server-side scraping

The MVP must not require a backend server.

### 5.4 Automatic article rewriting

NewsClean must not alter article text.

### 5.5 Automatic translation

Translation is outside the initial product scope.

### 5.6 AI-dependent operation

The core product must work without AI.

AI may later improve article detection and cleanup recommendations, but it must not be a dependency for the fundamental workflow.

---

## 6. Target Users

### Primary User — Newsroom Operator

Needs to quickly capture an article for broadcast or editorial use.

Typical workflow:

```text
Find article
→ Clean page
→ Capture
→ Send to production
```

### Secondary User — Graphic Designer

Needs clean references from websites for:

* Broadcast graphics
* Infographics
* Backgrounds
* Screens
* Editorial packages
* Motion graphics

### Secondary User — Journalist / Editor

Needs a clean visual representation of an article for:

* Editorial meetings
* Internal documentation
* Research
* Rundowns
* Reports

### Secondary User — Producer

Needs fast visual material for:

* Television segments
* Editorial packages
* Breaking news
* Interviews
* Social media production

---

## 7. Core Product Concept

NewsClean is based on five primary engines:

```text
Freeze Engine
      ↓
DOM Inspector
      ↓
Cleanup Engine
      ↓
Capture Engine
      ↓
Preset Engine
```

The engines should remain modular.

The UI must orchestrate these engines rather than contain their core logic.

---

## 8. Primary User Flow

### 8.1 Activation

The user opens a news webpage.

The user activates NewsClean from the Chrome toolbar.

The extension opens its control interface.

Primary action:

```text
Start Cleaning
```

---

### 8.2 Freeze

The system enters a controlled state.

Visual indicator:

```text
FROZEN
```

The page must stop unnecessary dynamic activity as far as technically possible.

The system should:

* Stop pending page loading where appropriate.
* Prevent unnecessary new visual content from appearing.
* Disable animations where possible.
* Stabilize the DOM.
* Preserve the current visual state.

The implementation must distinguish between:

```text
Soft Freeze
```

and:

```text
Hard Freeze
```

Soft Freeze is the default.

Hard Freeze may be exposed as an advanced option.

---

## 9. Inspection Mode

After freezing, the user activates:

```text
Inspect
```

The cursor becomes an element-selection tool.

When hovering over an element, NewsClean displays a visual overlay.

Example:

```text
┌──────────────────────────────┐
│ DIV.article-sidebar          │
│ 320 × 850 px                 │
└──────────────────────────────┘
```

The inspector should identify:

```text
TAG
ID
CLASS
SELECTOR
SIZE
POSITION
```

---

## 10. Element Actions

When an element is selected, the operator should have access to:

```text
Delete
Hide
Keep
Select Parent
Select Children
Delete All Matching
```

### Delete

Permanently removes the element from the current working DOM.

### Hide

Applies a reversible visibility state.

### Keep

Marks the element as editorially relevant.

### Select Parent

Moves selection to the nearest parent container.

### Select Children

Allows selection from descendant elements.

### Delete All Matching

Removes every element matching the generated selector.

This is particularly important for repeated advertisements.

---

## 11. Selector Engine

NewsClean must support multiple selector representations.

Minimum support:

```text
Tag selector
ID selector
Class selector
Attribute selector
CSS selector
```

Example:

```text
div
#sidebar
.advertisement
[data-ad]
aside.sidebar
```

The system should generate a stable selector whenever possible.

Selector generation must prioritize stability over raw DOM specificity.

The system should avoid unnecessary selectors such as:

```text
body > div:nth-child(4) > div:nth-child(2)
```

when a stable selector such as:

```text
.article-sidebar
```

is available.

---

## 12. Cleanup Modes

NewsClean must provide two conceptual cleanup strategies.

### Delete Mode

The operator explicitly removes unwanted elements.

```text
Select → Delete
```

### Keep Mode

The operator identifies the primary article container.

The system then removes or hides unrelated page content.

Example:

```text
Keep:
ARTICLE

Remove:
Everything outside ARTICLE
```

Keep Mode is intended to become one of the product's strongest productivity features.

---

## 13. Smart Cleanup

The product should provide an optional:

```text
Clean Page
```

action.

This system identifies common noise patterns.

Potential categories:

```text
Advertisement
Cookie Banner
Newsletter
Social
Recommendation
Related Content
Comments
Video
Sidebar
Sticky UI
Promotional Content
Navigation
```

The system must not automatically delete everything it detects.

Instead, it should produce a reviewable cleanup proposal.

Example:

```text
12 elements detected

Advertisement       5
Sidebar             1
Social              2
Recommendation      3
Cookie              1

[ Review Cleanup ]
```

The user remains in control.

---

## 14. Article Extraction

NewsClean should provide an article-oriented extraction layer.

The system should attempt to identify:

```text
Website
Logo
Article Title
Hero Image
Article Body
Author
Publication Date
```

Extraction must be non-destructive.

The extracted structure should be used to assist the user rather than silently replacing the original webpage.

---

## 15. Composition Mode

After cleanup, the user may enter:

```text
Compose
```

This creates a controlled presentation layer.

The operator may configure:

```text
Canvas Width
Canvas Height
Background
Padding
Scale
Margins
Alignment
```

Initial broadcast presets:

```text
1920 × 1080
3840 × 2160
```

The composition layer should support a clean editorial layout.

Example:

```text
┌───────────────────────────────────────┐
│               WEBSITE                 │
│                                       │
│ ARTICLE TITLE                         │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │                                   │ │
│ │          HERO IMAGE               │ │
│ │                                   │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Article body...                       │
│ Article body...                       │
│ Article body...                       │
└───────────────────────────────────────┘
```

---

## 16. Capture Engine

The capture engine is responsible for producing the final image.

Initial format:

```text
PNG
```

Required capture modes:

```text
Capture Visible
Capture Full Article
Capture Selection
Capture Composition
```

The system must support high-density rendering.

The capture engine should account for:

```text
devicePixelRatio
CSS pixel dimensions
viewport dimensions
full-page dimensions
```

The goal is to avoid low-resolution screenshots unsuitable for broadcast production.

---

## 17. Export Requirements

The exported image must:

* Preserve text readability.
* Preserve image quality.
* Preserve the cleaned layout.
* Avoid browser UI.
* Avoid NewsClean overlays.
* Avoid inspector controls.
* Avoid selection outlines.
* Avoid temporary cleanup UI.

The final export must represent only the intended editorial content.

---

## 18. Undo / Redo

All destructive DOM operations must generate a reversible command.

Conceptually:

```text
Command
↓
Execute
↓
Record State
↓
Undo Stack
```

Example:

```text
01 Remove .advertisement
02 Remove #sidebar
03 Hide .social-widget
04 Remove iframe
```

The user can:

```text
Undo
Undo
Redo
```

The history should remain available until the session is closed or explicitly reset.

---

## 19. Preset System

A preset represents a reusable cleanup strategy.

Example:

```json
{
  "name": "Example News Site",
  "hostname": "example.com",
  "remove": [
    ".advertisement",
    ".sidebar",
    ".related",
    ".comments"
  ],
  "keep": [
    ".site-header",
    ".article"
  ]
}
```

Presets must be stored locally in the MVP.

Required operations:

```text
Create Preset
Edit Preset
Delete Preset
Duplicate Preset
Export Preset
Import Preset
Apply Preset
```

---

## 20. News Mode

The product should eventually provide a dedicated workflow:

```text
NEWS MODE
```

The conceptual pipeline is:

```text
Freeze
↓
Detect Article
↓
Detect Noise
↓
Review
↓
Clean
↓
Compose
↓
Capture
```

News Mode should become the fastest path for newsroom users.

---

## 21. Keyboard Shortcuts

The product should support keyboard-first operation.

Initial shortcuts:

```text
Esc       Exit current mode
Ctrl+Z    Undo
Ctrl+Y    Redo
Delete    Delete selected element
H         Hide selected element
K         Keep selected element
I         Inspector
C         Capture
```

Final shortcuts must be reviewed against Chrome and operating-system conflicts.

---

## 22. UI Requirements

The interface must remain compact and production-oriented.

The primary toolbar should expose:

```text
Freeze
Inspect
Clean
Keep
Undo
Redo
Compose
Capture
Preset
```

The UI must not dominate the article.

The inspector should appear contextually rather than as a permanent large panel.

The product should support:

```text
Light UI
Dark UI
```

with dark mode being particularly suitable for newsroom environments.

---

## 23. Browser Compatibility

MVP target:

```text
Google Chrome
Chromium-based browsers
```

Primary technical target:

```text
Manifest V3
```

The architecture should avoid dependencies that make migration to other Chromium browsers unnecessarily difficult.

---

## 24. Privacy Requirements

NewsClean should operate locally.

The MVP must not send webpage contents to an external server.

The product must not upload:

* Article text
* Images
* Cookies
* Page HTML
* Browsing history

unless a future feature explicitly requires external processing and the user explicitly enables it.

Local processing is a core product principle.

---

## 25. Security Requirements

The extension must minimize privileges.

Permissions must be justified by actual functionality.

The product must not:

* Inject unnecessary remote scripts.
* Collect browsing history.
* Track visited websites.
* Upload webpage content.
* Modify permanent website data.

The extension should operate only on the active page when possible.

---

## 26. Performance Requirements

The extension must remain lightweight.

The DOM inspector should not introduce significant rendering overhead.

Target behavior:

```text
Inspector activation: < 100 ms perceived response
Element hover: near-immediate
Element selection: < 100 ms
Undo/Redo: near-immediate
Capture preparation: < 1 s for normal articles
```

Exact benchmarks will be established during implementation.

---

## 27. Failure Handling

If the page cannot be frozen safely, the system must inform the user.

Example:

```text
This page contains dynamic content that could not be fully frozen.

Soft Freeze is active.
Some elements may continue changing.
```

If capture fails:

```text
Capture failed.

Try:
• Capture Visible
• Capture Selection
• Disable Hard Freeze
```

The extension must never silently produce a corrupted capture.

---

## 28. MVP Scope

The first production-capable MVP contains:

```text
Chrome Manifest V3
Content Script
Service Worker
Freeze Engine
DOM Inspector
Element Selection
Element Delete
Element Hide
Element Keep
CSS Selector Detection
Delete All Matching
Undo / Redo
Basic Cleanup
Basic Article Detection
PNG Capture
Local Presets
Basic News Mode
```

The MVP does not require:

```text
AI
Cloud
Accounts
Backend
Team Collaboration
Remote Storage
PDF Export
Advanced Composition
```

---

## 29. Version 1.1 Candidates

After MVP validation:

```text
Advanced Composition
Full Article Capture
Preset Import/Export
Smart Cleanup
Improved Article Extraction
Broadcast Templates
Better Selector Generation
Capture Scaling
JPEG/WebP Export
```

---

## 30. Version 2 Candidates

Potential future capabilities:

```text
AI Article Detection
AI Cleanup Suggestions
Automatic Website Profiles
Shared Preset Library
PDF Export
Editorial Metadata
Newsroom Integration
NDI / Broadcast Output
Direct After Effects Integration
```

These capabilities must not influence MVP architecture unless there is a clear technical dependency.

---

## 31. Success Metrics

The product should be evaluated using operational metrics rather than download count alone.

Primary KPI:

**Time to Clean Capture**

Target:

```text
< 30 seconds
```

for a normal article after the user is familiar with the tool.

Additional metrics:

```text
Average cleanup actions per article
Average capture time
Undo rate
Preset usage rate
Capture success rate
Number of manually removed elements
```

A successful product should progressively reduce the number of manual operations required per website.

---

## 32. Acceptance Criteria — MVP

The MVP is considered functional when an operator can:

```text
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
```

---

## 33. Product Principles

### Principle 01 — User Control

Nothing important should be deleted automatically without user visibility or a reversible action.

### Principle 02 — Local First

The webpage should be processed locally whenever technically possible.

### Principle 03 — DOM First

NewsClean manipulates the webpage structure rather than merely painting pixels over unwanted content.

### Principle 04 — Reversible

Cleanup operations should be undoable.

### Principle 05 — Fast

The product is designed for newsroom production environments where seconds matter.

### Principle 06 — Broadcast Ready

The final result must be suitable for professional visual production.

### Principle 07 — Progressive Intelligence

Manual control comes first. Automation and AI come later.

---

## 34. Product Definition in One Sentence

**NewsClean turns a cluttered news webpage into a clean, controlled, broadcast-ready editorial capture directly inside Chrome.**

---

## 35. Architectural Direction

The PRD establishes the following high-level architecture:

```text
Chrome Extension
│
├── Service Worker
│
├── Content Runtime
│   ├── Freeze Engine
│   ├── DOM Inspector
│   ├── Selection Engine
│   ├── Cleanup Engine
│   ├── Extraction Engine
│   └── Session History
│
├── UI Runtime
│   ├── Toolbar
│   ├── Inspector
│   ├── Cleanup Panel
│   ├── Preset Manager
│   └── Capture UI
│
├── Capture Runtime
│   └── PNG Renderer
│
└── Local Storage
    └── Presets / Settings
```

This document defines the product requirements.

Detailed technical decisions belong to the Architecture and subsystem documents that follow.

---

## 36. Document Status

**Status:** Foundation Draft

The next document should translate these product requirements into a concrete technical architecture without introducing unnecessary abstractions or features outside the approved product scope.
