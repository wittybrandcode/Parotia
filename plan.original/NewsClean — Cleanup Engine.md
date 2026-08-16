# NewsClean
## Cleanup Engine

**Document ID:** 06-CLEANUP-ENGINE  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`

---

## 1. Purpose

The Cleanup Engine is the core editorial transformation layer of NewsClean.

Its responsibility is to transform a frozen webpage from:

```text
RAW WEB PAGE
```

into:

```text
CLEAN EDITORIAL PAGE
```

while preserving user control and complete reversibility.

The Cleanup Engine receives targets and rules from:

- DOM Inspector
- Selection Engine
- Preset Engine
- Smart Cleanup Analyzer
- Keep Mode

and converts them into controlled DOM operations through the Mutation Engine.

The fundamental architecture is:

```text id="0v6f9w"
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

---

# 2. Core Principle

The Cleanup Engine must follow one fundamental rule:

> **Never modify the webpage directly. Convert editorial intent into validated, reversible mutations.**

Therefore, this is invalid architecture:

```text id="f7w0l1"
Inspector
   ↓
element.remove()
```

The correct architecture is:

```text id="n8g7m5"
Inspector
   ↓
Cleanup Intent
   ↓
Cleanup Engine
   ↓
RemoveElementCommand
   ↓
Mutation Engine
   ↓
History
   ↓
DOM
```

---

# 3. Problem

A news webpage may contain hundreds of elements that are irrelevant to the intended capture.

Typical examples:

```text id="p9h4z7"
Advertising
Cookie banners
Newsletter prompts
Social widgets
Sidebars
Related articles
Comments
Video players
Promotional blocks
Floating buttons
Sticky elements
Navigation
Recommended content
```

The user needs to remove this noise without damaging:

```text id="k8x3v5"
Website identity
Article title
Hero image
Article body
Publication metadata
Source information
```

The Cleanup Engine provides the controlled mechanism to achieve this.

---

# 4. Cleanup Operations

The MVP defines the following operations:

```text id="q8k2y7"
DELETE
HIDE
KEEP
DELETE_MATCHING
RESTORE
```

Future operations may include:

```text id="s2h6n9"
MOVE
WRAP
CLONE
REPLACE
CROP
EXTRACT
```

These are outside MVP scope.

---

# 5. DELETE

DELETE removes an element from the working DOM.

Conceptually:

```text id="x3v7q2"
Element
   ↓
REMOVE
   ↓
Element no longer participates in layout
```

DELETE is destructive relative to the working session but reversible through Undo.

The original webpage remains untouched.

---

# 6. DELETE Semantics

Deleting an element means:

```text id="n4b5x8"
element
+
descendants
```

are removed from the working DOM.

The operation must preserve enough information for restoration.

Required restoration information includes:

```text id="k9m2v1"
Parent
Insertion position
Element structure
Attributes
Relevant DOM state
```

---

# 7. HIDE

HIDE removes an element visually without destroying its DOM representation.

Conceptually:

```text id="e5j7q3"
Element
   ↓
visibility / display strategy
   ↓
Element not visually presented
```

The exact CSS strategy belongs to the Mutation Engine.

The Cleanup Engine only specifies intent:

```text id="q7w2n5"
HIDE
```

HIDE is useful when:

- The operator is unsure whether deletion is safe.
- A later operation may need the element.
- Layout preservation matters.
- The operator wants a reversible visual cleanup.

---

# 8. DELETE vs HIDE

The UI should clearly distinguish:

```text id="s4g8w1"
DELETE
```

from:

```text id="c3p9m7"
HIDE
```

DELETE:

```text Removes from layout and DOM
```

HIDE:

```text Keeps DOM but removes visual presence
```

The exact rendering behavior may differ according to the selected hide strategy.

---

# 9. KEEP

KEEP is a semantic operation.

It does not immediately delete anything.

Instead:

```text id="v2r6m4"
Selected Element
      ↓
KEEP
      ↓
Protected Editorial Target
```

This target can later be consumed by:

- Keep Mode
- Smart Cleanup
- Article Extraction
- Composition
- Presets

KEEP is therefore a rule rather than a simple mutation.

---

# 10. KEEP Protection

A kept element should be represented as an internal editorial rule.

Example:

```json id="m6r3k1"
{
  "type": "KEEP",
  "selector": "article.main",
  "scope": "SESSION"
}
```

The rule protects the selected content from cleanup operations.

The system should not allow a broad cleanup operation to accidentally remove a protected element without explicit confirmation.

---

# 11. DELETE_MATCHING

DELETE_MATCHING removes all elements matching a selector.

Example:

```text id="4s5n7b"
.advertisement
```

may match:

```text id="6n3v8q"
7 elements
```

The Cleanup Engine should generate one logical cleanup operation:

```text id="w5f2k8"
DELETE_MATCHING(".advertisement")
```

This operation must be undoable as one unit.

---

# 12. Matching Workflow

The workflow is:

```text id="f8k2m1"
Selector
   ↓
Validate
   ↓
Query DOM
   ↓
Count Matches
   ↓
Check Protected Elements
   ↓
Preview
   ↓
Confirm
   ↓
Mutate
```

The engine must never blindly execute a selector supplied by the UI.

---

# 13. Selector Validation

Before execution:

```text id="v3m9x2"
selector
```

must be validated.

The engine should verify:

```text id="a6r8p1"
Syntax valid
Selector executable
Target elements accessible
```

Invalid selectors must produce a controlled error.

Example:

```text id="j8c2v5"
Invalid CSS selector.
No changes were made.
```

---

# 14. Match Count

Before bulk deletion, the UI should display:

```text id="q1f8v3"
Selector:
.advertisement

Matches:
7
```

This prevents accidental mass deletion.

---

# 15. Zero Match

If:

```text id="b6m4x8"
matchCount = 0
```

the operation should not create a mutation command.

The user should receive:

```text id="z8r2v4"
No matching elements found.
```

This is especially important for presets whose selectors may become outdated.

---

# 16. Protected Elements

Before deleting elements, the Cleanup Engine must evaluate active KEEP rules.

Example:

```text id="f5h2m8"
KEEP:
article

DELETE MATCHING:
div
```

The engine must not blindly delete the article.

Protected descendants or ancestors must be handled according to cleanup policy.

---

# 17. Protection Hierarchy

Protection should follow:

```text id="u7g1p9"
EXPLICIT KEEP
    >
MANUAL SELECTION
    >
ARTICLE TARGET
    >
AUTOMATED CLEANUP
```

Explicit user intent has the highest priority.

Automated cleanup has the lowest priority.

---

# 18. Cleanup Intent

All operations should first become a normalized intent.

Conceptual model:

```ts id="f4x8y1"
type CleanupIntent =
  | DeleteElementIntent
  | HideElementIntent
  | KeepElementIntent
  | DeleteMatchingIntent;
```

Example:

```json id="q8x2m5"
{
  "type": "DELETE",
  "target": {
    "elementId": "el_0042"
  },
  "source": "USER"
}
```

---

# 19. Cleanup Sources

The engine must identify where an operation originated.

Sources:

```text id="m8f4y3"
USER
PRESET
SMART_CLEANUP
KEEP_MODE
SYSTEM
```

This is important for:

- Auditability
- UI feedback
- Debugging
- Future analytics
- Different confirmation policies

---

# 20. User Operations

Operations explicitly initiated by the operator should require minimal confirmation.

Example:

```text id="g3k9v2"
Select
→ Delete
```

The action is already explicit.

A confirmation dialog should not appear for every single deletion.

---

# 21. Automated Operations

Automated operations should be more conservative.

For example:

```text id="s5r7q1"
Smart Cleanup
→ Detect 12 likely ads
```

should produce:

```text id="a7n4m8"
Cleanup Proposal
```

rather than immediate deletion.

---

# 22. Cleanup Proposal

A proposal is a set of potential operations.

Conceptually:

```json id="c4h8n6"
{
  "id": "proposal_001",
  "source": "SMART_CLEANUP",
  "items": [
    {
      "category": "ADVERTISEMENT",
      "selector": ".ad",
      "matchCount": 5,
      "confidence": 0.97,
      "action": "DELETE"
    }
  ]
}
```

The user can:

```text id="m5q8s2"
Accept
Reject
Modify
```

individual items.

---

# 23. Smart Cleanup Boundary

The Cleanup Engine must not become the classifier.

Classification belongs to an Analyzer.

Architecture:

```text id="z3n5q7"
DOM
 ↓
Analyzer
 ↓
Cleanup Proposal
 ↓
Cleanup Engine
 ↓
Mutation Engine
```

The Cleanup Engine executes validated intent.

---

# 24. Rule-Based Cleanup

MVP Smart Cleanup may use deterministic heuristics.

Possible indicators:

```text id="k7p4m2"
class contains "ad"
id contains "advert"
role="complementary"
aria-label indicates advertisement
known ad dimensions
iframe advertisement patterns
newsletter keywords
cookie-banner patterns
```

These rules belong to the Analyzer subsystem.

The Cleanup Engine only consumes their output.

---

# 25. Keep Mode

Keep Mode is a high-level cleanup operation.

Workflow:

```text id="d7m4x8"
User selects article
      ↓
KEEP
      ↓
Analyze surrounding DOM
      ↓
Identify outside content
      ↓
Generate Cleanup Proposal
      ↓
Review
      ↓
Apply
```

Keep Mode must never simply execute:

```text id="p9x3m6"
body.innerHTML = article.innerHTML
```

This would destroy important page context and break the architecture.

---

# 26. Keep Mode Strategy

The system should identify:

```text id="n5f7q2"
Target Subtree
```

then classify nodes outside it into:

```text id="k2m8v4"
KEEP
REMOVE_CANDIDATE
UNKNOWN
```

Unknown content should not be automatically deleted.

---

# 27. Keep Mode Safety

If the selected target is too broad:

```text id="z6h3x8"
BODY
MAIN
HTML
```

the system should warn the user.

Example:

```text id="v4n9m2"
This element contains most of the page.
Keep Mode may have little effect.
```

If the selected target is extremely small:

```text id="f3k8p1"
SPAN
```

the system may recommend selecting a parent.

---

# 28. Cleanup Scope

Every cleanup operation should have a scope.

Initial scopes:

```text id="m7p3x4"
ELEMENT
MATCHES
SUBTREE
PAGE
```

### ELEMENT

One selected element.

### MATCHES

All selector matches.

### SUBTREE

Selected element and descendants.

### PAGE

Full-page cleanup proposal.

PAGE scope should remain heavily protected in MVP.

---

# 29. Cleanup Context

Each operation should record:

```text id="v6q2n8"
Session ID
Source
Operation type
Target
Selector
Match count
Timestamp
```

This is useful for debugging and future reporting.

---

# 30. Mutation Boundary

Cleanup Engine must not directly manipulate the DOM.

It calls:

```text id="g5m8q1"
Mutation Engine
```

The Mutation Engine is responsible for:

- Actual DOM mutation
- Restoration metadata
- Command creation
- History integration
- Error handling

---

# 31. Command Creation

Each successful cleanup operation produces a command.

Example:

```text id="j4x7p3"
DELETE
↓
RemoveElementCommand
↓
History
```

For bulk deletion:

```text id="b8m2k6"
DELETE_MATCHING
↓
BatchRemoveCommand
↓
History
```

---

# 32. Atomic Operations

Bulk cleanup should be atomic from the user's perspective.

If the operation targets:

```text id="y4h6m9"
7 elements
```

the user should see:

```text id="p2r8x1"
1 cleanup action
```

not seven separate Undo operations.

Therefore:

```text id="s8n3v5"
BatchCommand
├── Remove A
├── Remove B
├── Remove C
├── Remove D
├── Remove E
├── Remove F
└── Remove G
```

Undo restores all seven.

---

# 33. Partial Failure

If a bulk operation cannot mutate one target, the engine should not silently continue without reporting the problem.

Possible policies:

```text id="w3k5m8"
ROLLBACK_ALL
PARTIAL_APPLY
```

MVP recommendation:

```text id="r8m2q4"
ROLLBACK_ALL
```

for operations that can be safely transactional.

This provides stronger user trust.

---

# 34. Rollback

If mutation fails:

```text id="u6p3z8"
Mutation A ✓
Mutation B ✓
Mutation C ✗
```

the system should attempt:

```text id="j2m7x5"
Undo B
Undo A
```

and return:

```text id="c9v4n1"
Operation failed.
No changes were applied.
```

where practical.

---

# 35. Cleanup History

The Cleanup Engine does not own the Undo/Redo stacks.

The History Engine does.

Cleanup submits commands.

Architecture:

```text id="g6x2k5"
Cleanup
 ↓
Command
 ↓
History
 ↓
Mutation
```

or equivalently, depending on implementation:

```text id="r5m8q3"
Cleanup
 ↓
Mutation Command
 ↓
History registration
 ↓
Execute
```

The exact sequencing must remain consistent across the implementation.

---

# 36. Restore Operation

Restore is generally initiated through Undo.

However, the Cleanup Engine may expose explicit:

```text id="q8m4x2"
Restore Hidden
```

for HIDE operations.

DELETE restoration should remain primarily associated with Undo.

---

# 37. Cleanup Rules

A cleanup rule is a reusable instruction.

Conceptual model:

```json id="z6p4w9"
{
  "type": "REMOVE",
  "selector": ".advertisement",
  "enabled": true
}
```

A rule should contain:

```text id="y7m3q1"
Rule ID
Action
Selector
Enabled
Priority
Scope
```

---

# 38. Rule Priority

Rules may conflict.

Example:

```text id="c4m8x2"
REMOVE .sidebar
KEEP #important-sidebar
```

KEEP must win.

Recommended priority:

```text id="v2q7m5"
EXPLICIT KEEP
↓
EXPLICIT DELETE
↓
PRESET
↓
SMART CLEANUP
```

The final rule-resolution system must be deterministic.

---

# 39. Rule Conflict Resolution

When conflicting rules exist:

```text id="j8n4p6"
REMOVE X
KEEP X
```

the system should resolve:

```text id="b5q2r8"
KEEP
```

because explicit preservation has higher priority.

The UI should optionally report:

```text id="s7m3x9"
1 cleanup rule overridden by Keep rule.
```

---

# 40. Rule Matching

Rules should be evaluated against the current DOM.

A preset selector that matched 5 elements yesterday may match 3 today.

The engine must always resolve against the current page.

---

# 41. Rule Versioning

Presets and rules should include versions.

Example:

```text id="y3r6k8"
Preset version: 2
Rule version: 1
```

This allows future migration.

---

# 42. Cleanup Session

The Cleanup Engine should operate within the current session.

Session state includes:

```text id="d9m2x4"
Active Rules
Protected Elements
Applied Operations
Cleanup Proposals
```

The session ends when:

```text id="p7k5v3"
Page reloads
Navigation occurs
User resets session
```

---

# 43. Cleanup Reset

The user should have:

```text id="w4m8z2"
Reset Cleanup
```

This should undo all NewsClean cleanup operations for the session.

It must not necessarily unfreeze the page.

Conceptually:

```text id="m6q2r9"
Cleanup State
↓
Reset
↓
Original Working DOM
```

Freeze state remains independent.

---

# 44. Reset Safety

Before a full reset, the UI may display:

```text id="q7n3m5"
Reset all cleanup changes?
```

This is one of the few cases where confirmation is justified because the operation affects multiple changes.

---

# 45. Cleanup Stack

The engine should expose high-level cleanup statistics:

```text id="z5m8q1"
Removed: 12
Hidden: 3
Kept: 4
Rules applied: 7
```

This information is useful for the session UI.

---

# 46. Cleanup Preview

Before applying large automated operations, the engine should support preview.

Conceptually:

```text id="x3k7m5"
PREVIEW
 ↓
Highlight candidates
 ↓
User review
 ↓
APPLY
```

Preview itself must not mutate the DOM.

---

# 47. Preview Renderer

Preview candidates should use the same overlay architecture as the DOM Inspector.

Do not add temporary borders to page elements.

Use:

```text id="m8q2v4"
NewsClean Overlay
```

to visualize proposed deletions.

---

# 48. Cleanup Categories

The engine should support semantic categories even if the MVP classification is basic.

```text id="c6m3x8"
ADVERTISEMENT
NAVIGATION
SIDEBAR
SOCIAL
COOKIE
NEWSLETTER
RECOMMENDATION
RELATED
COMMENTS
VIDEO
PROMOTION
OTHER
```

Categories help the UI explain why an element is proposed for deletion.

---

# 49. Manual vs Automatic Confidence

Manual operations:

```text id="q3m8n5"
confidence = USER_EXPLICIT
```

Automated operations:

```text id="w6k2p4"
confidence = numeric / heuristic
```

The engine should treat confidence as a policy input.

For example:

```text id="v9m3x1"
confidence < threshold
→ review required
```

The exact threshold belongs to Smart Cleanup.

---

# 50. Cleanup Safety Score

A future system may calculate a cleanup safety score.

Example:

```text id="r4k7m2"
Cleanup Safety: 92%
```

Factors may include:

```text id="x5p8n3"
Protected article
Selector specificity
Element category
Content density
Position
Semantic role
```

This is future functionality and not an MVP requirement.

---

# 51. Editorial Preservation

The Cleanup Engine should recognize certain classes of high-value content.

It should treat these as protected candidates:

```text id="p7m4x2"
ARTICLE
H1
MAIN
Hero image
Article body
Source identity
Publication metadata
```

However, automatic protection should remain conservative.

User-defined KEEP always takes precedence.

---

# 52. Source Preservation

The Cleanup Engine should not remove source identity by default.

Potential protected elements include:

```text id="g2m8v5"
Logo
Brand name
Source name
Article metadata
```

This supports journalistic attribution and visual context.

---

# 53. Article Body Protection

If the Extraction Engine identifies:

```text id="f8q3m7"
article.body
```

the Cleanup Engine should treat it as a high-value region.

Automated cleanup should avoid deleting its descendants unless explicitly requested.

---

# 54. Empty Container Cleanup

After deletion, the page may contain:

```text id="z4m7x1"
<div></div>
```

The MVP should not automatically remove all empty containers.

Some empty containers may be required for layout.

A future layout optimizer may address this.

---

# 55. Layout Integrity

Cleanup operations should not unintentionally destroy page geometry unless that is the intended effect.

For example:

```text id="k5p2m8"
Remove sidebar
```

should allow the remaining article to naturally reflow.

The engine should not attempt to manually reposition the article unless Composition Mode is active.

---

# 56. Fixed and Sticky Elements

Deleting fixed or sticky elements may alter the visual layout significantly.

The engine should treat them normally but may warn for large viewport-spanning elements.

Example:

```text id="h3m7q9"
Element covers 90% of viewport.
```

A warning may be appropriate for automated deletion.

Manual deletion remains explicit user intent.

---

# 57. Full-Page Cleanup

A future PAGE cleanup operation may analyze the complete document.

This should be separated from basic element deletion.

Pipeline:

```text id="s6n2p8"
Full Page
 ↓
Analyze
 ↓
Classify
 ↓
Proposal
 ↓
Review
 ↓
Apply
```

Never perform a blind:

```text id="b4x7m9"
remove everything not article
```

operation.

---

# 58. Cleanup API

Conceptual service contract:

```ts id="m7x4q2"
interface CleanupEngine {
  deleteElement(target: ElementReference): Promise<CleanupResult>;
  hideElement(target: ElementReference): Promise<CleanupResult>;
  keepElement(target: ElementReference): Promise<CleanupResult>;

  deleteMatching(
    selector: string
  ): Promise<CleanupResult>;

  applyProposal(
    proposal: CleanupProposal
  ): Promise<CleanupResult>;

  reset(): Promise<void>;

  getState(): CleanupState;
}
```

---

# 59. Cleanup Result

Conceptual:

```json id="q8m5v3"
{
  "success": true,
  "operationId": "op_001",
  "type": "DELETE",
  "affectedCount": 1,
  "source": "USER"
}
```

Bulk operation:

```json id="r3k7x2"
{
  "success": true,
  "operationId": "op_002",
  "type": "DELETE_MATCHING",
  "affectedCount": 7,
  "source": "PRESET"
}
```

---

# 60. Cleanup State

Conceptual:

```ts id="w5n8q3"
interface CleanupState {
  removedCount: number;
  hiddenCount: number;
  keptCount: number;
  activeRules: number;
  protectedTargets: number;
  proposalCount: number;
}
```

This state is session-scoped.

---

# 61. Preset Integration

Preset application should use exactly the same Cleanup Engine as manual cleanup.

Correct:

```text id="f7m2x9"
Preset
 ↓
Cleanup Intent
 ↓
Cleanup Engine
 ↓
Mutation Engine
```

Incorrect:

```text id="j3q8m5"
Preset
 ↓
Direct DOM manipulation
```

This ensures identical behavior and Undo/Redo support.

---

# 62. Smart Cleanup Integration

Smart Cleanup follows:

```text id="k4x7m2"
Analyzer
 ↓
Proposal
 ↓
Cleanup Engine
 ↓
Validation
 ↓
Mutation Engine
```

The Analyzer never directly modifies the DOM.

---

# 63. Keep Mode Integration

Keep Mode follows:

```text id="m8q3v7"
Inspector
 ↓
Keep Target
 ↓
Keep Analyzer
 ↓
Cleanup Proposal
 ↓
Cleanup Engine
 ↓
Mutation Engine
```

This maintains separation between:

```text id="s6n2k4"
Selection
Analysis
Decision
Mutation
```

---

# 64. Capture Integration

The Capture Engine should consume the cleaned page after Cleanup Engine operations are complete.

The Cleanup Engine should expose:

```text id="x7m3q8"
isClean()
getProtectedTargets()
getMutationSummary()
```

Capture does not need to know how elements were removed.

---

# 65. Cleanup and Freeze

Cleanup should normally require:

```text id="v5q8m2"
Freeze State = FROZEN
```

or:

```text id="c7m3x9"
DEGRADED
```

with user permission.

This prevents cleanup from fighting with a still-changing webpage.

---

# 66. Concurrency

The Cleanup Engine should serialize mutation operations.

Avoid:

```text id="r4n7m3"
Delete A
Delete B
Delete C
```

executing concurrently against a changing DOM.

Prefer:

```text id="g8m2x5"
Queue
 ↓
Validate
 ↓
Execute
 ↓
Record
 ↓
Next
```

Bulk operations can be internally batched.

---

# 67. Race Conditions

Possible race:

```text id="j7m4q2"
Inspector selects A
↓
Page replaces A
↓
Cleanup attempts DELETE A
```

The Cleanup Engine must verify:

```text id="p8x3m6"
target.isConnected
```

and, where necessary, re-resolve the target.

If target resolution is ambiguous:

```text id="n4q7v2"
Abort operation.
```

Never silently delete a different element.

---

# 68. Cleanup Transaction

For complex operations:

```text id="x2m8q5"
BEGIN
 ↓
Validate
 ↓
Prepare
 ↓
Mutate
 ↓
Verify
 ↓
COMMIT
```

Failure:

```text id="v7q3m9"
ROLLBACK
```

This provides stronger consistency.

---

# 69. Mutation Verification

After a DELETE:

```text id="s4m7x2"
target.isConnected === false
```

should normally be true.

After HIDE:

```text id="k8q3m5"
visual state changed
```

should be verified where practical.

After DELETE_MATCHING:

```text id="g2m7x4"
remainingMatches === 0
```

should be checked.

---

# 70. Cleanup Logging

Development logging may record:

```text id="q5m8x3"
Operation ID
Type
Source
Selector
Affected count
Duration
Result
```

Do not log full article content or arbitrary webpage HTML.

---

# 71. Security

Selectors and attributes originate from webpage content or user interaction.

They must be treated as untrusted data.

The engine must not evaluate arbitrary JavaScript.

No:

```text id="z7m3q8"
eval(selector)
```

No executable page-provided payloads.

Selectors must be passed to native DOM selector APIs only after validation.

---

# 72. Performance

The Cleanup Engine should avoid repeated full-document scans.

For a single element:

```text id="m5q8v2"
O(1) target operation
```

For selector-based cleanup:

```text id="n7x3m4"
querySelectorAll(selector)
```

once per operation.

Do not call:

```text id="j8q2m6"
querySelectorAll(selector)
```

multiple times unnecessarily.

---

# 73. Large Page Handling

Some websites may contain tens of thousands of DOM nodes.

Bulk cleanup should:

- Resolve matches once.
- Create one command.
- Avoid repeated layout reads.
- Avoid recalculating geometry unless needed.
- Yield to the browser for exceptionally large operations if necessary.

The UI should remain responsive.

---

# 74. Cleanup Statistics

The UI may expose:

```text id="f3m7q2"
12 removed
3 hidden
4 kept
```

This provides the operator with immediate feedback.

---

# 75. Undo Integration

After:

```text id="w8m3q5"
DELETE .advertisement
```

Undo must restore all affected elements.

After:

```text id="q4m7x2"
HIDE .sidebar
```

Undo must restore visibility.

After:

```text id="z5n8m3"
KEEP article
```

Undo may remove the KEEP rule if KEEP is treated as session state.

The exact distinction between mutation history and semantic rule history must remain explicit.

---

# 76. Redo Integration

Redo should reapply the exact operation against the same logical targets where possible.

For dynamic pages, reapplication must verify that targets remain valid.

If they no longer exist:

```text id="c6m2x8"
Redo unavailable for changed target
```

rather than deleting an unintended element.

---

# 77. Reset Integration

`Reset Cleanup` should conceptually execute:

```text id="v4m8q2"
Undo all cleanup commands
Clear temporary rules
Clear protected targets
Clear proposals
```

It should leave:

```text id="s3n7m5"
Freeze state
```

unchanged.

---

# 78. Acceptance Criteria

The Cleanup Engine is MVP-complete when:

```text id="x7m3q5"
1. A selected element can be deleted.
2. A selected element can be hidden.
3. A selected element can be marked Keep.
4. All elements matching a valid selector can be deleted.
5. Bulk deletion is represented as one logical Undo operation.
6. Invalid selectors do not mutate the page.
7. Zero-match selectors do not create history entries.
8. Protected elements are not accidentally removed.
9. Manual operations require no unnecessary confirmation.
10. Automated proposals require review before mutation.
11. Cleanup operations pass through Mutation Engine.
12. Cleanup does not directly manipulate the DOM.
13. Cleanup can be reset.
14. Presets use the same cleanup pipeline.
15. Smart Cleanup uses the same cleanup pipeline.
16. Dynamic/stale targets are handled safely.
17. Failed bulk operations can be rolled back where practical.
18. Cleanup remains responsive on large pages.
```

---

# 79. Future Extensions

Potential future capabilities:

```text id="p8m3x6"
Semantic cleanup
AI proposals
Element grouping
Visual region cleanup
Layout normalization
Smart whitespace cleanup
Automatic source preservation
Cleanup scoring
Per-site cleanup learning
Shared newsroom rules
Cleanup macros
```

These features must reuse the same intent → validation → mutation architecture.

---

# 80. Final Cleanup Architecture

The complete conceptual model is:

```text id="j4m8q2"
                    DOM INSPECTOR
                          │
                          ▼
                  ┌───────────────┐
                  │ CLEANUP INTENT│
                  └───────┬───────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          DELETE        HIDE         KEEP
             │            │            │
             └────────────┼────────────┘
                          ▼
                  ┌───────────────┐
                  │   VALIDATOR   │
                  └───────┬───────┘
                          ▼
                  ┌───────────────┐
                  │   PROTECTION  │
                  │   / RULES     │
                  └───────┬───────┘
                          ▼
                  ┌───────────────┐
                  │    COMMAND    │
                  └───────┬───────┘
                          ▼
                  ┌───────────────┐
                  │   MUTATION    │
                  │    ENGINE     │
                  └───────┬───────┘
                          ▼
                         DOM
                          │
                          ▼
                  ┌───────────────┐
                  │    HISTORY    │
                  └───────────────┘
```

---

# 81. Architectural Invariants

The following rules are mandatory:

```text id="m3x8q7"
1. Cleanup never directly manipulates the DOM.
2. Every mutation passes through Mutation Engine.
3. Every destructive operation has a restoration strategy.
4. User intent has higher priority than automation.
5. Explicit KEEP has higher priority than automated DELETE.
6. Automated cleanup produces proposals before mutation.
7. Bulk operations are atomic where practical.
8. Invalid selectors cause no mutation.
9. Zero-match rules create no mutation history.
10. Stale targets must be detected.
11. Presets use the same cleanup pipeline as manual operations.
12. Smart Cleanup uses the same cleanup pipeline.
13. Keep Mode produces controlled proposals.
14. Cleanup state is session-scoped.
15. Cleanup does not control Freeze state.
16. Cleanup does not perform image capture.
17. Cleanup does not perform article extraction.
18. Cleanup must remain deterministic.
19. Page content is untrusted input.
20. No arbitrary JavaScript execution is permitted.
```

---

# 82. Next Document

The next document is:

`07-ARTICLE-EXTRACTION.md`

It will define how NewsClean identifies and preserves the editorial structure of a webpage:

```text id="q8m4x2"
Website Identity
Article Container
Title
Subtitle
Hero Image
Author
Publication Date
Source
Article Body
Editorial Metadata
Confidence
Fallback Strategies
Semantic HTML
OpenGraph
Schema.org
JSON-LD
Readability Signals
```

The Extraction Engine will remain read-only and will provide structured editorial information to Cleanup, Keep Mode, Composition, and Capture without directly modifying the page.