# NewsClean — Cleanup Engine

**Document ID:** `06-CLEANUP-ENGINE`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`

## 1. Purpose

The Cleanup Engine is the core editorial transformation layer of NewsClean. It transforms a frozen webpage into a clean editorial page while preserving user control and complete reversibility. It receives targets and rules from the DOM Inspector, Selection Engine, Preset Engine, Smart Cleanup Analyzer, and Keep Mode, and converts them into controlled DOM operations through the Mutation Engine.

Core architecture:

```text
USER / ANALYZER
      ↓
CLEANUP INTENT
      ↓
CLEANUP ENGINE
      ↓
VALIDATION
      ↓
MUTATION ENGINE
      ↓
HISTORY ENGINE
      ↓
DOM
```

## 2. Core Principle

> Never modify the webpage directly. Convert editorial intent into validated, reversible mutations.

## 3. Problem

A news page may contain hundreds of elements irrelevant to the intended capture — advertising, cookie banners, newsletter prompts, social widgets, sidebars, related articles, comments, video players, promotional blocks, floating buttons, sticky elements, navigation, recommended content. The user must be able to remove this noise without damaging website identity, article title, hero image, article body, publication metadata, or source information.

## 4. Cleanup Operations

MVP operations: `DELETE`, `HIDE`, `KEEP`, `DELETE_MATCHING`, `RESTORE`.

Future operations (outside MVP scope): `MOVE`, `WRAP`, `CLONE`, `REPLACE`, `CROP`, `EXTRACT`.

## 5. DELETE

DELETE removes an element and its descendants from the working DOM. It is destructive relative to the working session but reversible through Undo; the original webpage remains untouched. Restoration requires preserving: parent, insertion position, element structure, attributes, and relevant DOM state.

## 6. HIDE

HIDE removes an element visually without destroying its DOM representation. The exact CSS strategy (visibility/display) belongs to the Mutation Engine; the Cleanup Engine specifies only the intent `HIDE`. HIDE is useful when the operator is unsure whether deletion is safe, a later operation may need the element, layout preservation matters, or a reversible visual cleanup is wanted.

## 7. DELETE vs HIDE

The UI must clearly distinguish the two: DELETE removes from layout and DOM; HIDE keeps the DOM but removes visual presence. Exact rendering behavior may differ by the selected hide strategy.

## 8. KEEP

KEEP is a semantic operation — a rule, not a simple mutation. It marks the selected element as a protected editorial target that can later be consumed by Keep Mode, Smart Cleanup, Article Extraction, Composition, and Presets. A kept element is represented as an internal editorial rule:

```json
{ "type": "KEEP", "selector": "article.main", "scope": "SESSION" }
```

The system must not allow a broad cleanup operation to accidentally remove a protected element without explicit confirmation.

## 9. DELETE_MATCHING

DELETE_MATCHING removes all elements matching a selector (e.g. `.advertisement` may match 7 elements). The Cleanup Engine generates one logical cleanup operation, `DELETE_MATCHING(".advertisement")`, which must be undoable as one unit.

## 10. Matching Workflow

The workflow is: Selector → Validate → Query DOM → Count Matches → Check Protected Elements → Preview → Confirm → Mutate. The engine must never blindly execute a selector supplied by the UI.

## 11. Selector Validation

Before execution a selector must be validated: syntax valid, selector executable, target elements accessible. Invalid selectors produce a controlled error — e.g. `Invalid CSS selector. No changes were made.`

## 12. Match Count

Before bulk deletion the UI displays the selector and its match count (e.g. `.advertisement` → 7 matches) to prevent accidental mass deletion.

## 13. Zero Match

If `matchCount = 0`, the operation must not create a mutation command or history entry. The user receives `No matching elements found.` This is especially important for presets whose selectors may become outdated.

## 14. Protected Elements

Before deleting, the Cleanup Engine must evaluate active KEEP rules (e.g. KEEP `article` vs DELETE MATCHING `div`). It must not blindly delete protected content; protected descendants or ancestors are handled according to cleanup policy.

## 15. Protection Hierarchy

Protection hierarchy: `EXPLICIT KEEP > MANUAL SELECTION > ARTICLE TARGET > AUTOMATED CLEANUP`. Explicit user intent has the highest priority; automated cleanup the lowest.

## 16. Cleanup Intent

All operations are normalized into an intent before execution:

```ts
type CleanupIntent = DeleteElementIntent | HideElementIntent | KeepElementIntent | DeleteMatchingIntent;
```

```json
{ "type": "DELETE", "target": { "elementId": "el_0042" }, "source": "USER" }
```

## 17. Cleanup Sources

The engine records where each operation originated: `USER`, `PRESET`, `SMART_CLEANUP`, `KEEP_MODE`, `SYSTEM`. This drives auditability, UI feedback, debugging, future analytics, and confirmation policy.

## 18. Confirmation Policy

- **User operations:** explicit operator actions require minimal confirmation — a confirmation dialog must not appear for every deletion, since the action is already explicit.
- **Automated operations:** more conservative. Smart Cleanup detecting 12 likely ads produces a Cleanup Proposal for review rather than immediate deletion.

## 19. Cleanup Proposal

A proposal is a set of potential operations:

```json
{
  "id": "proposal_001",
  "source": "SMART_CLEANUP",
  "items": [
    { "category": "ADVERTISEMENT", "selector": ".ad", "matchCount": 5, "confidence": 0.97, "action": "DELETE" }
  ]
}
```

The user can accept, reject, or modify individual items.

## 20. Smart Cleanup Boundary

The Cleanup Engine must not become the classifier; classification belongs to an Analyzer: DOM → Analyzer → Cleanup Proposal → Cleanup Engine → Mutation Engine. MVP Smart Cleanup may use deterministic heuristics — class/id containing "ad" or "advert", `role="complementary"`, advertisement-related aria-labels, known ad dimensions, iframe ad patterns, newsletter keywords, cookie-banner patterns. These rules belong to the Analyzer subsystem; the Cleanup Engine only consumes their output.

## 21. Keep Mode

Keep Mode is a high-level cleanup operation: user selects article → KEEP → analyze surrounding DOM → identify outside content → generate Cleanup Proposal → review → apply. It must never execute `body.innerHTML = article.innerHTML` — this would destroy page context and break the architecture.

Strategy: identify the target subtree, then classify nodes outside it as `KEEP`, `REMOVE_CANDIDATE`, or `UNKNOWN`; unknown content must not be deleted automatically.

Safety: if the target is too broad (`BODY`, `MAIN`, `HTML`), warn the user — `This element contains most of the page. Keep Mode may have little effect.` If extremely small (e.g. `SPAN`), recommend selecting a parent.

## 22. Cleanup Scope

Every cleanup operation has a scope: `ELEMENT` (one selected element), `MATCHES` (all selector matches), `SUBTREE` (selected element and descendants), `PAGE` (full-page cleanup proposal). PAGE scope stays heavily protected in MVP.

## 23. Cleanup Context

Each operation records: session ID, source, operation type, target, selector, match count, timestamp — for debugging and future reporting.

## 24. Mutation Boundary

The Cleanup Engine never directly manipulates the DOM; it calls the Mutation Engine, which owns actual DOM mutation, restoration metadata, command creation, history integration, and error handling.

Each successful cleanup operation produces a command: `DELETE → RemoveElementCommand → History`; bulk deletion: `DELETE_MATCHING → BatchRemoveCommand → History`.

## 25. Atomic Operations

Bulk cleanup is atomic from the user's perspective. Deleting 7 elements appears as one cleanup action, not seven separate Undo operations; a BatchCommand wraps all removes so Undo restores all seven.

## 26. Partial Failure

If a bulk operation cannot mutate one target, the engine must report it — never silently continue. Policies: `ROLLBACK_ALL` or `PARTIAL_APPLY`; MVP recommends `ROLLBACK_ALL` for safely transactional operations. On failure the system attempts Undo of applied mutations and returns `Operation failed. No changes were applied.` where practical.

## 27. Cleanup History

The Cleanup Engine does not own the Undo/Redo stacks — the History Engine does. Cleanup submits commands; sequencing (Cleanup → Command → History → Mutation, or Cleanup → Mutation Command → History registration → Execute) must remain consistent across the implementation.

## 28. Restore Operation

Restore is generally initiated through Undo. The Cleanup Engine may expose explicit `Restore Hidden` for HIDE operations; DELETE restoration remains primarily associated with Undo.

## 29. Cleanup Rules

A cleanup rule is a reusable instruction:

```json
{ "type": "REMOVE", "selector": ".advertisement", "enabled": true }
```

A rule contains: rule ID, action, selector, enabled, priority, scope.

## 30. Rule Priority

Rules may conflict (e.g. `REMOVE .sidebar` vs `KEEP #important-sidebar`). KEEP must win. Recommended priority: `EXPLICIT KEEP > EXPLICIT DELETE > PRESET > SMART CLEANUP`. The final rule-resolution system must be deterministic. On conflict (`REMOVE X` vs `KEEP X`), KEEP wins because explicit preservation has higher priority; the UI may report `1 cleanup rule overridden by Keep rule.`

## 31. Rule Matching & Versioning

Rules are always evaluated against the current DOM (a preset selector that matched 5 elements yesterday may match 3 today). Presets and rules carry versions (e.g. `Preset version: 2`, `Rule version: 1`) for future migration.

## 32. Cleanup Session

The engine operates within the current session. Session state: active rules, protected elements, applied operations, cleanup proposals. The session ends when the page reloads, navigation occurs, or the user resets the session.

## 33. Cleanup Reset

`Reset Cleanup` undoes all NewsClean cleanup operations for the session without necessarily unfreezing the page: undo all cleanup commands, clear temporary rules, clear protected targets, clear proposals. Freeze state remains unchanged. The UI may confirm first (`Reset all cleanup changes?`) — a justified confirmation because it affects multiple changes.

## 34. Cleanup Statistics

The engine exposes session cleanup statistics: `Removed: 12, Hidden: 3, Kept: 4, Rules applied: 7`.

## 35. Cleanup Preview

Before applying large automated operations the engine supports preview (highlight candidates → user review → apply). Preview must not mutate the DOM; candidates are visualized with the same overlay architecture as the DOM Inspector — never temporary borders on page elements.

## 36. Cleanup Categories

The engine supports semantic categories even with basic MVP classification: `ADVERTISEMENT`, `NAVIGATION`, `SIDEBAR`, `SOCIAL`, `COOKIE`, `NEWSLETTER`, `RECOMMENDATION`, `RELATED`, `COMMENTS`, `VIDEO`, `PROMOTION`, `OTHER`. Categories help the UI explain why an element is proposed for deletion.

## 37. Confidence

Manual operations set `confidence = USER_EXPLICIT`; automated operations use numeric/heuristic confidence. Confidence is a policy input — e.g. `confidence < threshold → review required`. The exact threshold belongs to Smart Cleanup.

## 38. Cleanup Safety Score

A future system may calculate a cleanup safety score (e.g. `Cleanup Safety: 92%`) from protected article, selector specificity, element category, content density, position, and semantic role. Not MVP.

## 39. Editorial Preservation

The engine recognizes high-value content as protected candidates: `ARTICLE`, `H1`, `MAIN`, hero image, article body, source identity, publication metadata. Automatic protection stays conservative; user-defined KEEP always takes precedence.

- **Source preservation:** source identity (logo, brand name, source name, article metadata) is not removed by default, supporting journalistic attribution and visual context.
- **Article body:** if the Extraction Engine identifies `article.body`, it is a high-value region; automated cleanup avoids deleting its descendants unless explicitly requested.

## 40. Layout & Edge Cases

- **Empty containers:** MVP does not automatically remove empty containers left after deletion — some are required for layout. A future layout optimizer may address this.
- **Layout integrity:** cleanup must not unintentionally destroy page geometry unless intended. Removing a sidebar should let the article reflow naturally; the engine does not manually reposition content unless Composition Mode is active.
- **Fixed/sticky elements:** treated normally, but a warning may be appropriate for automated deletion of large viewport-spanning elements (e.g. `Element covers 90% of viewport.`). Manual deletion remains explicit user intent.
- **Full-page cleanup:** a future PAGE cleanup operation analyzes the complete document (Analyze → Classify → Proposal → Review → Apply), separated from basic element deletion. Never a blind `remove everything not article`.

## 41. Cleanup API

```ts
interface CleanupEngine {
  deleteElement(target: ElementReference): Promise<CleanupResult>;
  hideElement(target: ElementReference): Promise<CleanupResult>;
  keepElement(target: ElementReference): Promise<CleanupResult>;
  deleteMatching(selector: string): Promise<CleanupResult>;
  applyProposal(proposal: CleanupProposal): Promise<CleanupResult>;
  reset(): Promise<void>;
  getState(): CleanupState;
}
```

## 42. Cleanup Result

```json
{ "success": true, "operationId": "op_001", "type": "DELETE", "affectedCount": 1, "source": "USER" }
```

Bulk:

```json
{ "success": true, "operationId": "op_002", "type": "DELETE_MATCHING", "affectedCount": 7, "source": "PRESET" }
```

## 43. Cleanup State

```ts
interface CleanupState {
  removedCount: number;
  hiddenCount: number;
  keptCount: number;
  activeRules: number;
  protectedTargets: number;
  proposalCount: number;
}
```

State is session-scoped.

## 44. Integrations

- **Preset:** preset application uses the same Cleanup Engine as manual cleanup (Preset → Cleanup Intent → Cleanup Engine → Mutation Engine), never direct DOM manipulation — identical behavior and Undo/Redo support.
- **Smart Cleanup:** Analyzer → Proposal → Cleanup Engine → Validation → Mutation Engine; the Analyzer never directly modifies the DOM.
- **Keep Mode:** Inspector → Keep Target → Keep Analyzer → Cleanup Proposal → Cleanup Engine → Mutation Engine, preserving separation between selection, analysis, decision, and mutation.
- **Capture:** the Capture Engine consumes the cleaned page after Cleanup operations complete; the Cleanup Engine exposes `isClean()`, `getProtectedTargets()`, `getMutationSummary()`. Capture does not need to know how elements were removed.
- **Freeze:** cleanup normally requires `Freeze State = FROZEN`, or `DEGRADED` with user permission, preventing cleanup from fighting a still-changing webpage.

## 45. Concurrency

The Cleanup Engine serializes mutation operations; concurrent deletes (A, B, C) against a changing DOM are avoided. Prefer a queue (Queue → Validate → Execute → Record → Next). Bulk operations can be internally batched.

## 46. Race Conditions

If the page replaces a target between selection and cleanup (e.g. Inspector selects A, page replaces A, cleanup attempts DELETE A), the engine must verify `target.isConnected` and, where necessary, re-resolve the target. If target resolution is ambiguous: abort the operation. Never silently delete a different element.

## 47. Cleanup Transaction

Complex operations follow a transaction: `BEGIN → Validate → Prepare → Mutate → Verify → COMMIT`. Failure: `ROLLBACK`. This provides stronger consistency.

## 48. Mutation Verification

After DELETE, `target.isConnected === false` should normally be true. After HIDE, the visual state change should be verified where practical. After DELETE_MATCHING, `remainingMatches === 0` should be checked.

## 49. Logging

Development logging records: operation ID, type, source, selector, affected count, duration, result. Do not log full article content or arbitrary webpage HTML.

## 50. Security

Selectors and attributes originate from webpage content or user interaction and must be treated as untrusted data. The engine must not evaluate arbitrary JavaScript — no `eval(selector)`, no executable page-provided payloads. Selectors are passed to native DOM selector APIs only after validation.

## 51. Performance

Avoid repeated full-document scans. Single element: O(1) target operation. Selector-based cleanup: `querySelectorAll(selector)` once per operation — never multiple times unnecessarily. On large pages (tens of thousands of DOM nodes): resolve matches once, create one command, avoid repeated layout reads, avoid recalculating geometry unless needed, and yield to the browser for exceptionally large operations if necessary. The UI must remain responsive.

## 52. Undo / Redo / Reset

- **Undo:** after `DELETE .advertisement`, undo restores all affected elements; after `HIDE .sidebar`, undo restores visibility; after `KEEP article`, undo may remove the KEEP rule if KEEP is treated as session state. The distinction between mutation history and semantic rule history must remain explicit.
- **Redo:** reapplies the exact operation against the same logical targets where possible; on dynamic pages it must verify targets remain valid, and if they no longer exist report `Redo unavailable for changed target` rather than deleting an unintended element.
- **Reset:** executes undo of all cleanup commands and clears temporary rules, protected targets, and proposals; leaves Freeze state unchanged.

## 53. Acceptance Criteria & Invariants

The Cleanup Engine is MVP-complete when the following hold:

1. A selected element can be deleted, hidden, or marked Keep; all elements matching a valid selector can be deleted.
2. Cleanup never directly manipulates the DOM; every mutation passes through the Mutation Engine.
3. Every destructive operation has a restoration strategy; cleanup can be reset.
4. User intent has higher priority than automation; explicit KEEP has higher priority than automated DELETE.
5. Automated cleanup produces proposals before mutation; manual operations require no unnecessary confirmation.
6. Bulk operations are atomic where practical; failed bulk operations can be rolled back where practical.
7. Invalid selectors cause no mutation; zero-match rules create no mutation history.
8. Protected elements are not accidentally removed; stale targets must be detected and handled safely (redo unavailable for changed targets).
9. Presets and Smart Cleanup use the same cleanup pipeline as manual operations.
10. Keep Mode produces controlled proposals.
11. Cleanup state is session-scoped; cleanup does not control Freeze state, perform image capture, or perform article extraction.
12. Cleanup must remain deterministic.
13. Page content is untrusted input; no arbitrary JavaScript execution is permitted.
14. Cleanup remains responsive on large pages.
