# NewsClean — Product Vision & Principles

**Document ID:** 02-VISION  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Document:** `01-PRD.md`

## 1. Vision

> **Turn any relevant news webpage into a clean, controllable, broadcast-ready visual document without leaving the browser.**

A modern news article is surrounded by navigation, advertising, recommendations, subscriptions, social components, dynamic widgets, videos, tracking interfaces, and other visual noise. NewsClean transforms that environment into a controlled editorial workspace, making the browser behave like an editorial capture workstation rather than a passive webpage viewer.

## 2. Product Philosophy

NewsClean is not primarily a browser extension; it is an **editorial transformation layer between the Web and the newsroom**. The Web provides raw information, NewsClean provides editorial control, and the newsroom receives clean visual information.

## 3. Core Idea

> **Do not edit the screenshot. Edit the webpage before capturing it.**

- Traditional workflow: Web Page → Screenshot → Photoshop / After Effects → remove unwanted content → crop → export.
- NewsClean works at the **DOM layer**, not merely the pixel layer:

```text
Web Page → Freeze → Inspect DOM → Remove unwanted elements → Preserve editorial content → Capture
```

## 4. Vision for the User

- The operator needs no HTML, CSS, JavaScript, or browser-rendering knowledge; the interface exposes technical power through simple editorial actions.
- The user should think "Remove this," not "Find the CSS selector for this div."
- The system still exposes selector and DOM information when required by advanced users.
- Dual-level product: **Simple Mode** (editorial interaction) and **Advanced Mode** (DOM / CSS control).

## 5. Editorial First

Priority hierarchy: Information → Editorial relevance → Visual clarity → Production speed → Technical control. Not technical sophistication → complex interface → user configuration.

## 6. User Control Principle

NewsClean must never assume the machine understands editorial relevance better than the operator. An advertisement, related article, or sidebar is usually unwanted — but there are legitimate cases where any of these contain useful information.

> **Automation proposes. The operator decides.**

This principle governs Smart Cleanup and future AI functionality.

## 7. Non-Destructive by Default

The original webpage is external information; NewsClean must not create irreversible modifications to it.

- Working model: Original Page → Temporary Working DOM with Delete / Hide / Keep / Restore.
- The cleanup session exists independently from the original website.
- Reloading the page restores the original state.

## 8. Reversibility

Every meaningful operation must be reversible — a product principle, not merely a convenience. The user must feel safe experimenting with the page.

- Interaction model: Try → Observe → Undo if necessary → Continue, rather than Delete → Hope it was correct.

## 9. Freeze as a Fundamental Concept

The Web is dynamic; a newsroom capture is static. NewsClean introduces an explicit transition: Dynamic Web → **Freeze** → Controlled Document.

Freeze is more than stopping network requests — it is the transition from **website runtime** to **editorial working state**. Exact technical implementation: `04-FREEZE-ENGINE.md`.

## 10. DOM as the Editorial Layer

HTML provides semantic and structural information that a screenshot does not (screenshots provide only pixels). NewsClean exploits page semantics to enable:

- Precise deletion
- Reversible changes
- Selector-based cleanup
- Article extraction
- Presets
- Smart cleanup
- Future automation

> **The DOM is the primary source of control.**

## 11. The Keep Principle

Most cleanup systems are deletion-oriented; NewsClean is also preservation-oriented. Instead of "What should I remove?", the user should eventually be able to ask "What do I want to keep?" — e.g. article: title, hero image, body. Everything else becomes secondary. This is the conceptual foundation for **Keep Mode**.

## 12. Progressive Intelligence

1. **Level 1 — Manual:** the operator controls everything (Inspect → Select → Delete).
2. **Level 2 — Rule-Based:** the system recognizes patterns (`.ads`, `.sidebar`, `.comments`, `.cookie-banner`).
3. **Level 3 — Intelligent:** the system understands editorial structure ("This is probably the article / the title; these five elements appear to be advertisements").

AI should improve the workflow, not replace user control.

## 13. Local-First Philosophy

Newsroom content may include sensitive, embargoed, political, financial, or otherwise confidential information.

> **Local processing by default.**

The browser performs core operations locally; no page content is transmitted externally merely to perform DOM inspection, element deletion, hiding, selector generation, basic article extraction, or PNG capture. Future AI may optionally use external or local models — an explicit architectural decision.

## 14. Speed as a Product Feature

In a newsroom, productivity is measured in operational time. Optimize for **time to clean capture**, not the number of available features.

- Ideal flow: Click → Freeze → Select → Remove → Capture.
- Avoid unnecessary dialogs, configuration screens, and modal workflows.

## 15. Broadcast Orientation

NewsClean is not designed around generic web screenshots; its ultimate output is intended for professional media production. The product must understand: **1920 × 1080**, **3840 × 2160**, safe area, pixel density, typography, image quality, aspect ratio, editorial hierarchy. The browser page is the source; the capture is the production asset.

## 16. Visual Integrity

Cleaning a page must not destroy its identity. Preserve the visual relationship between source, title, image, and article unless the operator intentionally changes it. The objective is a clean representation of the original editorial source — not generic text extraction.

## 17. Source Identity

Source identification matters in journalism. The cleaned result should be capable of preserving:

- Website logo
- Website name
- Article title
- Publication date
- Author
- Source URL where appropriate

Website identity must not be treated as disposable noise; a clean article without source identity may lose important editorial context.

## 18. Presets as Organizational Memory

A preset is knowledge about how a particular website is structured: Website → known layout → known unwanted components → known editorial components → reusable preset. Over time a newsroom builds a library of site-specific knowledge.

> **The newsroom learns how the Web is structured.**

## 19. From Personal Tool to Newsroom Infrastructure

The first version may serve one person; the long-term vision is a shared newsroom utility. Evolution: Individual User → Personal Presets → Department Presets → Newsroom Preset Library → Organizational Capture Standard.

Collaboration is not required in the MVP, but the architecture must not prevent it later.

## 20. Separation of Concerns

Maintain a strict distinction between: **Page State**, **Editorial Rules**, **UI State**, **Capture State**, **Persistent Presets**. This prevents the extension from becoming a monolithic content script.

## 21. Product Layers

Conceptual product architecture, each layer with a clear responsibility:

```text
Editorial UI
Workflow Engine
Editorial Services (Inspector, Cleanup, Extraction, Presets)
DOM Runtime
Web Page
```

## 22. UX Principle: Zero Fear

A newsroom operator should never feel that activating NewsClean might destroy the webpage. The product communicates: the original page is safe, changes are temporary, everything can be undone. This psychological safety matters because DOM manipulation can otherwise feel technically dangerous.

## 23. UX Principle: Immediate Feedback

Every action has a visible result: Delete removes the element immediately, Undo restores it immediately, Keep makes the preserved region visually obvious. Minimal latency between intention and visual feedback.

## 24. UX Principle: Contextual Complexity

- Basic users see: Inspect, Delete, Undo, Capture.
- Advanced users may see: CSS selector, computed dimensions, DOM path, selector matching, parent/children, preset rules.

Technical depth should be available without becoming mandatory.

## 25. Design Language

The visual language should communicate: editorial, technical, precise, fast, controlled, professional. The interface should avoid looking like a consumer browser extension — it should feel closer to a lightweight production tool.

Design system favors: clear hierarchy, compact controls, strong state indicators, precise spacing, high contrast, minimal decoration, fast interaction.

## 26. State Model

Core operational states:

```text
IDLE → ACTIVE → FROZEN → INSPECTING → CLEANING → COMPOSING → CAPTURING → EXPORTED
```

The UI must always communicate the current state (e.g. `● FROZEN`), so the operator is never uncertain whether the page is still dynamic.

## 27. Error Philosophy

Errors should be actionable. Bad: `Error 5032`. Better: "The page could not be fully frozen. Some dynamic content may still change. Try Soft Freeze or continue manually." The user must understand: (1) what happened, (2) what the consequence is, (3) what action is available.

## 28. Future Vision: One-Click Editorial Capture

For known websites, the ideal future interaction is:

> **One click to produce a clean article capture.**

Achieved progressively through presets + article detection + smart cleanup + optional AI.

## 29. Future Vision: Editorial Intelligence

Once the DOM, cleanup rules, and article structure are understood, the system could detect article, title, hero image, source, author, date, advertisement, navigation, and related content. It may explain, e.g., "I identified the article container and found 7 likely non-editorial elements" — the operator then confirms.

## 30. Future Vision: Broadcast Integration

Future pipeline: Web → NewsClean → Clean Article → PNG / SVG / PDF → After Effects → Broadcast Graphics. Potential integrations: NewsClean → After Effects, newsroom CMS, MAM, NDI. These are future opportunities, not MVP requirements.

## 31. What NewsClean Must Never Become

- A full browser
- A generic web scraper
- A permanent ad blocker
- A social media archiver
- A page builder
- A CMS
- A general automation platform
- An AI agent that autonomously changes webpages
- A cloud service that stores browsing content by default

> **Clean the page. Preserve the story. Capture the result.**

## 32. North Star

> **From messy webpage to clean editorial asset in seconds.**

Every feature should be evaluated against this statement. A feature that does not improve speed, control, editorial clarity, or capture quality should not automatically enter the product.

## 33. Product Principles — Final Set

1. Editorial First
2. DOM First
3. Local First
4. User Controlled
5. Reversible
6. Non-Destructive
7. Fast by Default
8. Broadcast Ready
9. Progressive Intelligence
10. Presets as Organizational Memory
11. Contextual Complexity
12. Clear Operational States
13. Source Identity Preservation
14. Minimal Dependencies
15. No Unnecessary Abstraction
