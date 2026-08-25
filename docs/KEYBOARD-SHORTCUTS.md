# Keyboard Shortcuts

Parotia provides keyboard shortcuts for power users. All shortcuts respect editable fields and won't hijack normal typing.

---

## Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Shift+Alt+F` | Freeze / Unfreeze the page | Always available |
| `Shift+Alt+P` | Toggle element picker | Only when frozen |
| `Escape` | Cancel current pick / close action bar | Only when picking |
| `Delete` | Delete the picked element | Only when element selected |
| `Backspace` | Delete the picked element | Only when element selected |

### Editor workspace

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + +` | Zoom in around the workspace centre |
| `Ctrl/Cmd + -` | Zoom out around the workspace centre |
| `0` | Fit the image to the workspace |
| `1` | Show actual image pixels at `100%` |
| `Space + Drag` | Pan the image without changing the active drawing tool |
| Middle mouse drag | Pan the image |
| Wheel / trackpad scroll | Pan horizontally or vertically |
| Trackpad pinch or `Ctrl/Cmd + Wheel` | Zoom around the pointer |

---

## Safety

Shortcuts are **disabled** when focus is inside:

- `<input>` fields
- `<textarea>` fields
- Elements with `contenteditable="true"`

This prevents conflicts with normal typing and form input.

---

## Workflow

The recommended keyboard-driven workflow:

```
1. Shift+Alt+F    → Freeze the page
2. Shift+Alt+P    → Start picking elements
3. Hover + Click  → Select an element
4. Delete         → Delete it
5. Repeat 3-4     → Clean more elements
6. Escape         → Stop picking
7. Capture button  → Export as PNG
8. Shift+Alt+F    → Unfreeze when done
```

---

## Implementation

Shortcuts are managed by `src/content/keyboard/shortcuts.ts`:

- Uses `keydown` event listener on `document`
- Checks `isEditable()` before processing
- Dispatches to session commands via callback functions
- Cleaned up on session end

---

## Customization

Shortcuts are currently hardcoded. Future versions may support user customization via the options page and `chrome.commands` API.
