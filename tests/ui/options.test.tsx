import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OptionsApp } from "@ui/src/options";

describe("options page", () => {
  afterEach(cleanup);

  it("renders the hero section with title and tagline", () => {
    render(<OptionsApp />);
    expect(screen.getByText("PAROTIA")).toBeInTheDocument();
    expect(screen.getByText("Clean the stage. Keep the story.")).toBeInTheDocument();
  });

  it("renders the toolbar guide with all buttons", () => {
    render(<OptionsApp />);
    expect(screen.getByText("Toolbar Guide")).toBeInTheDocument();
    expect(screen.getByText("Freeze / Unfreeze")).toBeInTheDocument();
    expect(screen.getByText("Pick")).toBeInTheDocument();
    expect(screen.getAllByText("Delete").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Hide / Show")).toBeInTheDocument();
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("renders keyboard shortcuts section", () => {
    render(<OptionsApp />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Shift + Alt + F")).toBeInTheDocument();
    expect(screen.getByText("Shift + Alt + P")).toBeInTheDocument();
  });

  it("toggles language to Arabic and back", () => {
    render(<OptionsApp />);

    const langBtn = screen.getByRole("button", { name: /التبديل/i });
    fireEvent.click(langBtn);

    expect(screen.getByText("نظّف المسرح. احتفظ بالقصة.")).toBeInTheDocument();
    expect(screen.getByText("دليل الأزرار")).toBeInTheDocument();
    expect(screen.getByText("تجميد / إلغاء التجميد")).toBeInTheDocument();
  });

  it("renders footer", () => {
    render(<OptionsApp />);
    expect(screen.getByText("Parotia — Open source Chrome extension")).toBeInTheDocument();
    expect(screen.getByText("View on GitHub")).toBeInTheDocument();
  });
});
