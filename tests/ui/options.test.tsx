import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SitePreset } from "@shared/types";
import { OptionsApp } from "@ui/src/options";

const PRESETS_KEY = "newsclean.presets";

function preset(overrides?: Partial<SitePreset>): SitePreset {
  return {
    schemaVersion: 1,
    id: "preset-1",
    version: 1,
    enabled: true,
    site: { hostname: "cnn.com" },
    cleanup: {
      rules: [{ id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true }],
    },
    metadata: { name: "Example News", author: "tester", source: "USER_CREATED" },
    ...overrides,
  };
}

function stubStorage(store: Record<string, unknown>) {
  (vi.mocked(chrome.storage.local.get) as unknown as Mock).mockImplementation(async (keys: unknown) => {
    if (typeof keys === "string" && keys in store) return { [keys]: store[keys] };
    if (Array.isArray(keys)) {
      const out: Record<string, unknown> = {};
      for (const key of keys) if (typeof key === "string" && key in store) out[key] = store[key];
      return out;
    }
    return {};
  });
  vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
  vi.mocked(chrome.storage.local.remove).mockResolvedValue(undefined);
}

describe("options page", () => {
  beforeEach(() => {
    vi.mocked(chrome.storage.local.get).mockReset();
    vi.mocked(chrome.storage.local.set).mockReset();
    vi.mocked(chrome.storage.local.remove).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the empty state when no presets are stored", async () => {
    stubStorage({});
    render(<OptionsApp />);

    expect(await screen.findByText(/No presets yet/)).toBeInTheDocument();
    expect(screen.getByText("Saved Presets")).toBeInTheDocument();
  });

  it("lists stored presets with their status chip and metadata", async () => {
    stubStorage({ [PRESETS_KEY]: { "preset-1": preset() } });
    render(<OptionsApp />);

    expect(await screen.findByText("Example News")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/cnn.com/)).toBeInTheDocument();
  });

  it("shows Off for a disabled preset", async () => {
    stubStorage({ [PRESETS_KEY]: { "preset-1": preset({ enabled: false }) } });
    render(<OptionsApp />);

    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
  });

  it("enable toggle flips the preset-level opt-in and persists it", async () => {
    const store = { [PRESETS_KEY]: { "preset-1": preset({ enabled: false }) } };
    stubStorage(store);
    render(<OptionsApp />);
    await screen.findByText("Off");

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    const written = vi.mocked(chrome.storage.local.set).mock.calls[0]?.[0] as {
      [PRESETS_KEY]: Record<string, SitePreset>;
    };
    expect(written[PRESETS_KEY]?.["preset-1"]?.enabled).toBe(true);
    await screen.findByText(/Enable.*Example News/);
  });

  it("delete requires confirmation and removes the preset", async () => {
    const store = { [PRESETS_KEY]: { "preset-1": preset() } };
    stubStorage(store);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<OptionsApp />);
    await screen.findByText("Example News");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled());
    const written = vi.mocked(chrome.storage.local.set).mock.calls[0]?.[0] as {
      [PRESETS_KEY]: Record<string, SitePreset>;
    };
    expect(written[PRESETS_KEY]?.["preset-1"]).toBeUndefined();
    await screen.findByText(/Delete.*Example News/);
  });

  it("does not delete when the confirmation is cancelled", async () => {
    stubStorage({ [PRESETS_KEY]: { "preset-1": preset() } });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OptionsApp />);
    await screen.findByText("Example News");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(screen.getByText("Example News")).toBeInTheDocument();
  });
});
