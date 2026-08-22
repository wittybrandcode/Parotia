import type { BackgroundCommand } from "@shared/types";
import { createId } from "@shared/utils/id";
import type { HandlerContext } from "./types";

type CleanupCommand = Extract<
  BackgroundCommand,
  | { type: "INSPECT_START" | "INSPECT_STOP" | "DELETE_ELEMENT" | "HIDE_ELEMENT" | "SHOW_ELEMENT" | "DELETE_MATCHING" | "UNDO" | "REDO" | "UNDO_TO" | "RESET" }
>;

export async function handleCleanupCommand(
  command: CleanupCommand,
  ctx: HandlerContext,
): Promise<unknown> {
  switch (command.type) {
    case "INSPECT_START": {
      if (ctx.cleanup?.inspecting) {
        ctx.cleanup.stopInspecting();
      } else {
        ctx.cleanup?.startInspecting();
      }
      ctx.broadcastState();
      return { active: ctx.cleanup?.inspecting ?? false };
    }

    case "INSPECT_STOP":
      ctx.cleanup?.stopInspecting();
      ctx.broadcastState();
      return { active: false };

    case "DELETE_ELEMENT": {
      const c = ctx.cleanup;
      const ref = c?.selected ?? null;
      const ok = ref !== null && c != null && c.deleteTarget(ref);
      ctx.broadcastState();
      return { success: ok };
    }

    case "HIDE_ELEMENT": {
      const c = ctx.cleanup;
      const ref = c?.selected ?? null;
      const ok = ref !== null && c != null && c.hideTarget(ref);
      ctx.broadcastState();
      return { success: ok };
    }

    case "SHOW_ELEMENT": {
      const ok = ctx.cleanup?.showSelected() ?? false;
      ctx.broadcastState();
      return { success: ok };
    }

    case "DELETE_MATCHING": {
      const ref = ctx.cleanup ? ctx.cleanup.selected : null;
      if (!ref || !ctx.cleanup) return { success: false, error: "No element selected" };

      if (command.payload.confirm) {
        const token = command.payload.token ?? "";
        const preview = ctx.deleteSimilarPreviews.get(token);
        ctx.deleteSimilarPreviews.delete(token);
        ctx.deleteSimilarToken = null;
        if (!preview || Date.now() > preview.expires) {
          ctx.cleanup.clearPreview();
          ctx.cleanup.setDeleteSimilarPreview(null);
          return { success: false, error: "Preview expired — pick the element and try again" };
        }
        const count = ctx.cleanup.confirmDeleteSimilar(ref, preview.signatures);
        ctx.cleanup.setDeleteSimilarPreview(null);
        ctx.broadcastState();
        return { success: count > 0, data: { count } };
      }

      const preview = ctx.cleanup.previewSimilarTargets(ref);
      if (!preview || preview.count === 0) {
        ctx.cleanup.clearPreview();
        ctx.cleanup.setDeleteSimilarPreview(null);
        return { success: false, error: "No similar elements found" };
      }
      const token = createId("preview");
      ctx.deleteSimilarPreviews.set(token, { signatures: preview.signatures, expires: Date.now() + 60_000 });
      ctx.deleteSimilarToken = token;
      ctx.cleanup.showPreview(preview.elements);
      ctx.cleanup.setDeleteSimilarPreview(preview.count);
      return { success: true, data: { count: preview.count, token, previewActive: true } };
    }

    case "UNDO": {
      const ok = ctx.cleanup?.undo() ?? false;
      ctx.broadcastState();
      return { success: ok };
    }

    case "REDO": {
      const ok = ctx.cleanup?.redo() ?? false;
      ctx.broadcastState();
      return { success: ok };
    }

    case "UNDO_TO": {
      ctx.ensureRuntime();
      const undone = ctx.cleanup?.undoThrough(command.payload.entryId) ?? false;
      ctx.broadcastState();
      return { success: true, undone };
    }

    case "RESET": {
      const ok = ctx.cleanup?.reset() ?? false;
      ctx.broadcastState();
      return { success: ok };
    }
  }
}
