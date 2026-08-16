# NewsClean
## Product Vision & Principles

**Document ID:** 02-VISION  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Document:** `01-PRD.md`

---

## 1. Vision

NewsClean exists to solve a simple newsroom problem:

> The web contains the information we need, but rarely in the visual form we need.

A modern news article is surrounded by navigation, advertising, recommendations, subscriptions, social components, dynamic widgets, videos, tracking interfaces, and other visual noise.

NewsClean transforms that environment into a controlled editorial workspace.

The product vision is:

> **Turn any relevant news webpage into a clean, controllable, broadcast-ready visual document without leaving the browser.**

NewsClean should make the browser behave less like a passive webpage viewer and more like an **editorial capture workstation**.

---

## 2. Product Philosophy

NewsClean is not primarily a browser extension.

It is an **editorial transformation layer between the Web and the newsroom**.

The Web provides:

```text
Raw Information
```

NewsClean provides:

```text
Editorial Control
```

The newsroom receives:

```text
Clean Visual Information
```

Conceptually:

```text
WEB
 │
 │  uncontrolled structure
 ▼
NEWSClean
 │
 │  inspection
 │  selection
 │  cleanup
 │  composition
 ▼
EDITORIAL CAPTURE
 │
 ▼
BROADCAST / NEWSROOM
```

---

## 3. The Core Idea

The fundamental idea behind NewsClean is:

> **Do not edit the screenshot. Edit the webpage before capturing it.**

Traditional workflow:

```text
Web Page
   ↓
Screenshot
   ↓
Photoshop / After Effects
   ↓
Remove unwanted content
   ↓
Crop
   ↓
Export
```

NewsClean workflow:

```text
Web Page
   ↓
Freeze
   ↓
Inspect DOM
   ↓
Remove unwanted elements
   ↓
Preserve editorial content
   ↓
Capture
```

This distinction defines the product.

NewsClean works at the **DOM layer**, not merely at the pixel layer.

---

## 4. Vision for the User

The operator should not need to understand HTML, CSS, JavaScript, browser rendering, or web development.

The interface should expose technical power through simple editorial actions.

The user should think:

> "Remove this."

not:

> "Find the CSS selector for this div."

However, the system should still expose the selector and DOM information when required by advanced users.

This creates a dual-level product:

```text
Simple Mode
     ↓
Editorial interaction

Advanced Mode
     ↓
DOM / CSS control
```

---

## 5. Editorial First

NewsClean is designed around newsroom priorities.

The hierarchy is:

```text
Information
   ↓
Editorial relevance
   ↓
Visual clarity
   ↓
Production speed
   ↓
Technical control
```

Not:

```text
Technical sophistication
   ↓
Complex interface
   ↓
User configuration
```

The technology should disappear behind the workflow.

---

## 6. User Control Principle

NewsClean must never assume that the machine understands editorial relevance better than the operator.

An advertisement is usually unwanted.

A related article may be unwanted.

A sidebar may be unwanted.

But there are legitimate cases where any of these components can contain useful information.

Therefore:

> **Automation proposes. The operator decides.**

This principle governs Smart Cleanup and future AI functionality.

---

## 7. Non-Destructive by Default

The original webpage is external information.

NewsClean must not create irreversible modifications to that external resource.

The working model is:

```text
Original Page
     │
     ▼
Temporary Working DOM
     │
     ├── Delete
     ├── Hide
     ├── Keep
     └── Restore
```

The cleanup session exists independently from the original website.

Reloading the page should restore the original state.

---

## 8. Reversibility

Every meaningful operation should be reversible.

This is not merely a convenience feature.

It is a product principle.

The user must feel safe experimenting with the page.

The interaction model should therefore encourage:

```text
Try
→ Observe
→ Undo if necessary
→ Continue
```

rather than:

```text
Delete
→ Hope it was correct
```

---

## 9. Freeze as a Fundamental Concept

The Web is dynamic.

A newsroom capture is static.

NewsClean therefore introduces an explicit transition:

```text
DYNAMIC WEB
      ↓
    FREEZE
      ↓
CONTROLLED DOCUMENT
```

Freeze is more than stopping network requests.

It represents the transition from:

**website runtime**

to:

**editorial working state**.

The exact technical implementation is defined in `04-FREEZE-ENGINE.md`.

---

## 10. DOM as the Editorial Layer

HTML provides semantic and structural information that a screenshot does not.

For example:

```text
ARTICLE
 ├── HEADER
 ├── TITLE
 ├── IMAGE
 ├── META
 └── BODY
```

A screenshot only provides pixels.

NewsClean should exploit the semantic structure of the page whenever possible.

This enables:

- Precise deletion
- Reversible changes
- Selector-based cleanup
- Article extraction
- Presets
- Smart cleanup
- Future automation

Therefore:

> **The DOM is the primary source of control.**

---

## 11. The Keep Principle

Most cleanup systems are deletion-oriented.

NewsClean should also be preservation-oriented.

Instead of asking:

> What should I remove?

the user should eventually be able to ask:

> What do I want to keep?

For example:

```text
KEEP
└── article
    ├── title
    ├── hero image
    └── body
```

Everything else becomes secondary.

This creates the conceptual foundation for **Keep Mode**.

---

## 12. Progressive Intelligence

NewsClean should evolve through three levels of intelligence.

### Level 1 — Manual

The operator controls everything.

```text
Inspect
→ Select
→ Delete
```

### Level 2 — Rule-Based

The system recognizes patterns.

```text
.ads
.sidebar
.comments
.cookie-banner
```

### Level 3 — Intelligent

The system understands editorial structure.

```text
This is probably the article.
This is probably the title.
These five elements appear to be advertisements.
```

The evolution is:

```text
Manual
  ↓
Rules
  ↓
Intelligence
```

AI should improve the workflow, not replace user control.

---

## 13. Local-First Philosophy

Newsroom content may include sensitive, embargoed, political, financial, or otherwise confidential information.

NewsClean should therefore follow:

> **Local processing by default.**

The browser should perform the core operations locally.

No page content should be transmitted externally merely to perform:

- DOM inspection
- element deletion
- hiding
- selector generation
- basic article extraction
- PNG capture

Future AI functionality may optionally use external or local models, but this must be an explicit architectural decision.

---

## 14. Speed as a Product Feature

In a newsroom, productivity is measured in operational time.

The product should optimize for:

```text
Time to Clean Capture
```

rather than the number of available features.

The ideal workflow should feel like:

```text
Click
→ Freeze
→ Select
→ Remove
→ Capture
```

The interface should avoid unnecessary dialogs, configuration screens, and modal workflows.

---

## 15. Broadcast Orientation

NewsClean is not designed around generic web screenshots.

Its ultimate output is intended for professional media production.

Therefore the product should understand concepts such as:

```text
1920 × 1080
3840 × 2160
Safe Area
Pixel Density
Typography
Image Quality
Aspect Ratio
Editorial Hierarchy
```

The browser page is the source.

The capture is the production asset.

---

## 16. Visual Integrity

Cleaning a page must not destroy its identity.

NewsClean should preserve the visual relationship between:

```text
Source
Title
Image
Article
```

unless the operator intentionally changes it.

The objective is not to create a generic text extraction.

The objective is to create a **clean representation of the original editorial source**.

---

## 17. Source Identity

Source identification is important in journalism.

The cleaned result should be capable of preserving:

- Website logo
- Website name
- Article title
- Publication date
- Author
- Source URL where appropriate

The product must therefore avoid treating the website identity as disposable noise.

A clean article without source identity may lose important editorial context.

---

## 18. Presets as Organizational Memory

A preset is more than a convenience.

It represents knowledge about how a particular website is structured.

For example:

```text
Website
    ↓
Known layout
    ↓
Known unwanted components
    ↓
Known editorial components
    ↓
Reusable preset
```

Over time, a newsroom can build a library of site-specific knowledge.

This creates an organizational asset:

> **The newsroom learns how the Web is structured.**

---

## 19. From Personal Tool to Newsroom Infrastructure

The first version may be used by one person.

The long-term vision is larger.

NewsClean could eventually become a shared newsroom utility.

Potential evolution:

```text
Individual User
      ↓
Personal Presets
      ↓
Department Presets
      ↓
Newsroom Preset Library
      ↓
Organizational Capture Standard
```

This should not require implementing collaboration in the MVP.

The architecture should simply avoid preventing it later.

---

## 20. Separation of Concerns

The product should maintain a strict distinction between:

```text
Page State
```

```text
Editorial Rules
```

```text
UI State
```

```text
Capture State
```

```text
Persistent Presets
```

This separation prevents the extension from becoming a monolithic content script.

---

## 21. Product Layers

The conceptual product architecture is:

```text
┌─────────────────────────────┐
│       Editorial UI          │
├─────────────────────────────┤
│      Workflow Engine        │
├─────────────────────────────┤
│     Editorial Services      │
│                             │
│ Inspector                   │
│ Cleanup                     │
│ Extraction                  │
│ Presets                     │
├─────────────────────────────┤
│      DOM Runtime            │
├─────────────────────────────┤
│       Web Page              │
└─────────────────────────────┘
```

Each layer should have a clear responsibility.

---

## 22. UX Principle: Zero Fear

A newsroom operator should never feel that activating NewsClean might destroy the webpage.

The product should communicate:

```text
Original page is safe.
Your changes are temporary.
Everything can be undone.
```

This psychological safety is important because DOM manipulation can otherwise feel technically dangerous.

---

## 23. UX Principle: Immediate Feedback

Every action should have a visible result.

If the user clicks:

```text
Delete
```

the element disappears immediately.

If the user clicks:

```text
Undo
```

the element returns immediately.

If the user selects:

```text
Keep Article
```

the preserved region becomes visually obvious.

There should be minimal latency between intention and visual feedback.

---

## 24. UX Principle: Contextual Complexity

Basic users should see:

```text
Inspect
Delete
Undo
Capture
```

Advanced users may see:

```text
CSS Selector
Computed Dimensions
DOM Path
Selector Matching
Parent / Children
Preset Rules
```

Technical depth should be available without becoming mandatory.

---

## 25. Design Language

The visual language should communicate:

```text
Editorial
Technical
Precise
Fast
Controlled
Professional
```

The interface should avoid looking like a consumer browser extension.

It should feel closer to a lightweight production tool.

The design system should favor:

- Clear hierarchy
- Compact controls
- Strong state indicators
- Precise spacing
- High contrast
- Minimal decoration
- Fast interaction

---

## 26. State Model

NewsClean should expose clear operational states.

Core states:

```text
IDLE
↓
ACTIVE
↓
FROZEN
↓
INSPECTING
↓
CLEANING
↓
COMPOSING
↓
CAPTURING
↓
EXPORTED
```

The UI should always communicate the current state.

For example:

```text
● FROZEN
```

is preferable to leaving the operator uncertain about whether the page is still dynamic.

---

## 27. Error Philosophy

Errors should be actionable.

Bad:

```text
Error 5032
```

Better:

```text
The page could not be fully frozen.

Some dynamic content may still change.
Try Soft Freeze or continue manually.
```

The user should understand:

1. What happened.
2. What the consequence is.
3. What action is available.

---

## 28. Future Vision: One-Click Editorial Capture

The long-term experience should approach:

```text
Open Article
     ↓
NewsClean
     ↓
NEWS MODE
     ↓
Clean Article
     ↓
PNG
```

For known websites, the ideal future interaction is:

> **One click to produce a clean article capture.**

This should be achieved progressively through:

```text
Presets
+
Article Detection
+
Smart Cleanup
+
Optional AI
```

---

## 29. Future Vision: Editorial Intelligence

Once the DOM, cleanup rules, and article structure are understood, NewsClean can become significantly more intelligent.

Potential capabilities include:

```text
Detect Article
Detect Title
Detect Hero Image
Detect Source
Detect Author
Detect Date
Detect Advertisement
Detect Navigation
Detect Related Content
```

The system could eventually explain:

> "I identified the article container and found 7 likely non-editorial elements."

The operator then confirms the action.

---

## 30. Future Vision: Broadcast Integration

The capture engine can eventually become an interface to the wider broadcast workflow.

Potential future pipeline:

```text
Web
 ↓
NewsClean
 ↓
Clean Article
 ↓
PNG / SVG / PDF
 ↓
After Effects
 ↓
Broadcast Graphics
```

A later integration could potentially expose:

```text
NewsClean → After Effects
NewsClean → newsroom CMS
NewsClean → MAM
NewsClean → NDI
```

These are future opportunities, not MVP requirements.

---

## 31. What NewsClean Must Never Become

NewsClean should avoid becoming:

- A full browser
- A generic web scraper
- A permanent ad blocker
- A social media archiver
- A page builder
- A CMS
- A general automation platform
- An AI agent that autonomously changes webpages
- A cloud service that stores browsing content by default

Its identity must remain focused.

> **Clean the page. Preserve the story. Capture the result.**

---

## 32. North Star

The North Star experience is:

> **From messy webpage to clean editorial asset in seconds.**

Every feature should be evaluated against this statement.

If a feature does not improve:

```text
Speed
Control
Editorial clarity
Capture quality
```

it should not automatically enter the product.

---

## 33. Product Principles — Final Set

The product architecture and UX should be governed by the following principles:

```text
01. Editorial First
02. DOM First
03. Local First
04. User Controlled
05. Reversible
06. Non-Destructive
07. Fast by Default
08. Broadcast Ready
09. Progressive Intelligence
10. Presets as Organizational Memory
11. Contextual Complexity
12. Clear Operational States
13. Source Identity Preservation
14. Minimal Dependencies
15. No Unnecessary Abstraction
```

---

## 34. Final Product Statement

NewsClean is a bridge between the uncontrolled visual complexity of the modern Web and the controlled visual requirements of professional news production.

Its purpose is not to change the Web.

Its purpose is to give the newsroom temporary control over how the Web is represented.

```text
THE WEB
   ↓
FREEZE
   ↓
UNDERSTAND
   ↓
CLEAN
   ↓
PRESERVE
   ↓
COMPOSE
   ↓
CAPTURE
   ↓
THE NEWSROOM
```

This is the product vision that all subsequent technical and UX documents must follow.