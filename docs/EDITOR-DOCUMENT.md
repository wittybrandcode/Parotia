# Editor Document Contract

`EditorDocument` is the source of truth for the Parotia editor. The Konva stage is a renderer of this document; it is not the persisted project model.

## Schema

Every document declares:

- `schema: "parotia.editor-document"`
- a numeric `version`, currently `6`
- stable document identity and creation/update timestamps
- native canvas dimensions and optional background colour
- one raster background source
- an ordered vector-layer list

Supported layer kinds are `image`, `text`, `rectangle`, `ellipse`, `line`, `arrow`, `callout`, `step` and `group`. Text layers explicitly declare `textMode: "point" | "paragraph"`; paragraph text owns positive width/height while point text uses natural metrics. Every layer carries a stable ID, name, order, visibility, lock state, opacity and `{x, y, scaleX, scaleY, rotation}` transform. Kind-specific properties remain explicit and serializable; runtime Konva nodes are never stored in the document.

## Invariants

- Canvas dimensions, image dimensions, font sizes and stroke widths are finite and positive.
- Layer IDs are non-empty and unique inside one document.
- Opacity stays between `0` and `1`; geometric scale cannot be zero.
- Persisted text scale is positive and uniform. Point Text resizing is baked into typographic metrics; Paragraph Text resizing is baked only into its width/height. Both return the layer transform to `1:1`, preventing horizontal or vertical glyph distortion.
- Point text cannot carry box dimensions or justified alignment; paragraph text requires both dimensions and supports horizontal plus vertical alignment and explicit left/center/right alignment for the final line of justified paragraphs.
- Point arrays contain complete finite coordinate pairs.
- Deserialization validates the complete structure and normalizes layer order to contiguous indices.
- Unknown schema versions fail closed. The parser migrates versions `0–4` to version `5`, including recursive groups and normalization of legacy non-uniform text transforms.

## Commands and history

History stores reversible document patches rather than full PNG snapshots for vector gestures:

- add/remove layer
- replace layer
- reorder layers
- replace document for legacy raster transforms

The timeline is bounded by entry count and estimated retained bytes. If a command itself cannot fit the memory budget, it is applied but becomes a history boundary: older commands are discarded so Undo can never cross an unrecorded transition.

## Rendering boundary

The document is rendered at native canvas coordinates. `EditorViewport` changes presentation only. Copy, Share and Save call `renderTo()` to flatten the background and ordered visible layers into a new native-resolution canvas; zoom, pan and workspace size are not part of the exported image.

Crop and adjustment still flatten the current document into a replacement raster document. That transition is reversible and restores the prior vector layers on Undo. Moving those two transforms into fully non-destructive document operations is intentionally separate from the layer-selection work.

## Text transformation boundary

Point Text is created with one click and follows its natural content bounds. It exposes corner anchors only; resizing is proportional and updates its real font/effect metrics. Paragraph Text is created by dragging a box and uses word wrapping, unchanged horizontal `left/center/right/justify` alignment, `justifyLastLine` (`left/center/right`) and vertical `top/middle/bottom` alignment. Its eight handles update the actual paragraph width and height during every transform frame, causing live text reflow while the text node stays at a `1:1` scale. Font size, spacing and effects never change through those handles; font size remains controlled exclusively by the typography size field.
