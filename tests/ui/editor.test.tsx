import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const annotation = {
    init: vi.fn(),
    loadLayers: vi.fn().mockResolvedValue(undefined),
    setTool: vi.fn(),
    setOptions: vi.fn(),
    setCommitListener: vi.fn(),
    renderTo: vi.fn((canvas: HTMLCanvasElement) => { canvas.width = 2; canvas.height = 2; }),
    destroy: vi.fn(),
  };
  const crop = { start: vi.fn(), stop: vi.fn() };
  const adjust = { start: vi.fn(), stop: vi.fn(), getFilter: vi.fn(() => "brightness(110%) contrast(90%)") };
  const viewport = {
    state: { scale: 1, percent: 100, mode: "FIT", offsetX: 0, offsetY: 0 },
    fit: vi.fn(), fill: vi.fn(), actualSize: vi.fn(), zoomBy: vi.fn(), setScale: vi.fn(),
    panBy: vi.fn(), refresh: vi.fn(), setGesturesEnabled: vi.fn(), destroy: vi.fn(),
  };
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
  return { annotation, crop, adjust, viewport, engine };
});

vi.mock("@ui/src/editor/CanvasEngine", () => ({ createCanvasEngine: () => mocks.engine }));
vi.mock("@ui/src/editor/AnnotationLayer", () => ({ createAnnotationLayer: () => mocks.annotation }));
vi.mock("@ui/src/editor/CropTool", () => ({ createCropTool: () => mocks.crop }));
vi.mock("@ui/src/editor/AdjustPanel", () => ({ createAdjustPanel: () => mocks.adjust }));
vi.mock("@ui/src/editor/EditorViewport", () => ({ createEditorViewport: () => mocks.viewport }));

import { EditorApp } from "@ui/src/editor/EditorApp";

function pngHeader(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
}

const SAFE_PNG = pngHeader(2, 2);

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
    vi.mocked(chrome.storage.local.get).mockImplementation((() => Promise.resolve({ "editor-image:test": SAFE_PNG })) as never);
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
    expect(screen.getByTitle("Decoded image dimensions")).toHaveTextContent("2 × 2 · 0.0 MP");
  });

  it("surfaces a failed save response instead of silently discarding it", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ success: false, error: { message: "Disk full" } });
    render(<EditorApp />);
    expect(await screen.findByText("Parotia Editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
  });

  it("refuses an oversized staged image before allocating the editor canvas", async () => {
    (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      "editor-image:test": pngHeader(20_000, 100),
    });
    render(<EditorApp />);

    expect(await screen.findByText(/exceeds the 16384px editor dimension limit/i)).toBeInTheDocument();
    expect(mocks.engine.loadImage).not.toHaveBeenCalled();
    expect(mocks.annotation.init).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("editor-image:test");
  });

  it("offers professional zoom controls and suspends gestures during crop", async () => {
    render(<EditorApp />);
    await waitFor(() => expect(mocks.annotation.init).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByText("Fill"));
    fireEvent.click(screen.getByText("1:1"));
    expect(mocks.viewport.zoomBy).toHaveBeenNthCalledWith(1, 1.2);
    expect(mocks.viewport.zoomBy).toHaveBeenNthCalledWith(2, 1 / 1.2);
    expect(mocks.viewport.fill).toHaveBeenCalled();
    expect(mocks.viewport.actualSize).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(mocks.viewport.fit).toHaveBeenCalled();
    expect(mocks.viewport.actualSize).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText("Crop"));
    expect(mocks.viewport.setGesturesEnabled).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  });

  it("records vector commits as document layers and rebuilds them through undo and redo", async () => {
    render(<EditorApp />);
    await waitFor(() => expect(mocks.annotation.setCommitListener).toHaveBeenCalled());
    const layer = {
      id: "layer-one", name: "Rectangle 1", order: 0, kind: "rectangle" as const, visible: true, locked: false, opacity: 1,
      transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 }, width: 40, height: 30,
      cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2,
    };
    const listener = mocks.annotation.setCommitListener.mock.calls.at(-1)?.[0] as ((value: typeof layer) => void);
    act(() => listener(layer));
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mocks.annotation.loadLayers).toHaveBeenLastCalledWith([]));
    expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    await waitFor(() => expect(mocks.annotation.loadLayers).toHaveBeenLastCalledWith([expect.objectContaining({ id: "layer-one", kind: "rectangle" })]));
  });
});
