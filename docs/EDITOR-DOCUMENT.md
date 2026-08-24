# Editor Document Contract

`EditorDocument` is the source of truth for the Parotia editor. The Konva stage is a renderer of this document; it is not the persisted project model.

## Schema

Every document declares:

- `schema: "parotia.editor-document"`
- a numeric `version`, currently `1`
- stable document identity and creation/update timestamps
- native canvas dimensions and optional background colour
- one raster background source
- an ordered vector-layer list

Supported layer kinds are `image`, `text`, `rectangle`, `ellipse`, `line`, `arrow` and `callout`. Every layer carries a stable ID, name, order, visibility, lock state, opacity and `{x, y, scaleX, scaleY, rotation}` transform. Kind-specific properties remain explicit and serializable; runtime Konva nodes are never stored in the document.

## Invariants

- Canvas dimensions, image dimensions, font sizes and stroke widths are finite and positive.
- Layer IDs are non-empty and unique inside one document.
- Opacity stays between `0` and `1`; geometric scale cannot be zero.
- Point arrays contain complete finite coordinate pairs.
- Deserialization validates the complete structure and normalizes layer order to contiguous indices.
- Unknown schema versions fail closed. The parser currently migrates the documented version-zero raster shape to version `1`.

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

## Next integration slice

The next milestone adds selection state and a Transformer over stable layer IDs, followed by move/resize/rotate commands and the visible layer panel. Project-file import/export can build directly on the validated serializer after those editing interactions stabilize.
