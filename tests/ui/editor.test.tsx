import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const annotation = {
    init: vi.fn(),
    setTool: vi.fn(),
    setOptions: vi.fn(),
    setCommitListener: vi.fn(),
    renderTo: vi.fn((canvas: HTMLCanvasElement) => { canvas.width = 2; canvas.height = 2; }),
    destroy: vi.fn(),
  };
  const crop = { start: vi.fn(), stop: vi.fn() };
  const adjust = { start: vi.fn(), stop: vi.fn(), getFilter: vi.fn(() => "brightness(110%) contrast(90%)") };
  const canvas = document.createElement("canvas");
  const engine = {
    canvas,
    width: 2,
    height: 2,
    loadImage: vi.fn().mockResolvedValue(undefined),
    toDataURL: vi.fn(() => "data:image/png;base64,AAAA"),
    toBlob: vi.fn().mockResolvedValue(new Blob(["png"], { type: "image/png" })),
    resize: vi.fn(), applyFilter: vi.fn(), destroy: vi.fn(),
  };
  return { annotation, crop, adjust, engine };
});

vi.mock("@ui/src/editor/CanvasEngine", () => ({ createCanvasEngine: () => mocks.engine }));
vi.mock("@ui/src/editor/AnnotationLayer", () => ({ createAnnotationLayer: () => mocks.annotation }));
vi.mock("@ui/src/editor/CropTool", () => ({ createCropTool: () => mocks.crop }));
vi.mock("@ui/src/editor/AdjustPanel", () => ({ createAdjustPanel: () => mocks.adjust }));

import { EditorApp } from "@ui/src/editor/EditorApp";

class ImmediateImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
}

describe("image editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", ImmediateImage);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
    vi.mocked(chrome.storage.local.get).mockImplementation((() => Promise.resolve({ "editor-image:test": "data:image/png;base64,AAAA" })) as never);
    vi.mocked(chrome.storage.local.remove).mockResolvedValue(undefined);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: true });
    window.history.replaceState({}, "", "#%7B%22imageKey%22%3A%22editor-image%3Atest%22%2C%22filename%22%3A%22capture.png%22%2C%22editorToken%22%3A%22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%22%2C%22parentOrigin%22%3A%22https%3A%2F%2Fpage.example%22%7D");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("loads the staged capture, configures annotations, and saves with its capability", async () => {
    render(<EditorApp />);

    expect(await screen.findByText("Parotia Editor")).toBeInTheDocument();
    await waitFor(() => expect(mocks.annotation.init).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Draw"));
    fireEvent.click(screen.getByTitle("Rectangle"));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "DOWNLOAD_EDITOR_RESULT",
      payload: expect.objectContaining({ editorToken: "a".repeat(48), filename: "capture.png" }),
    })));
    expect(mocks.annotation.renderTo).toHaveBeenCalled();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("editor-image:test");
  });

  it("surfaces a failed save response instead of silently discarding it", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: false, error: { message: "Disk full" } });
    render(<EditorApp />);
    expect(await screen.findByText("Parotia Editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
  });
});
