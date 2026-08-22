import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OptionsApp } from "@ui/src/options";

describe("options page", () => {
  afterEach(cleanup);

  it("renders the hero section with title, tagline and version badge", () => {
    render(<OptionsApp />);
    expect(screen.getByText("PAROTIA")).toBeInTheDocument();
    expect(screen.getByText("Clean the stage. Keep the story.")).toBeInTheDocument();
    expect(screen.getByText("v1.4.0")).toBeInTheDocument();
  });

  it("renders tabs and defaults to the About panel", () => {
    render(<OptionsApp />);
    const aboutTab = screen.getByRole("tab", { name: "About" });
    const guideTab = screen.getByRole("tab", { name: "How It Works" });
    expect(aboutTab).toHaveAttribute("aria-selected", "true");
    expect(guideTab).toHaveAttribute("aria-selected", "false");

    expect(screen.getByText("What Parotia can do")).toBeInTheDocument();
    expect(screen.getByText("Freeze the page")).toBeInTheDocument();
    expect(screen.getByText("Pick any element")).toBeInTheDocument();
    expect(screen.getByText("Capture it clean")).toBeInTheDocument();
    expect(screen.getByText("Select a region")).toBeInTheDocument();

    expect(screen.queryByText("Toolbar Guide")).not.toBeInTheDocument();
  });

  it("shows the toolbar guide when switching to the How It Works tab", () => {
    render(<OptionsApp />);
    fireEvent.click(screen.getByRole("tab", { name: "How It Works" }));

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
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "About" }));
    expect(screen.getByText("What Parotia can do")).toBeInTheDocument();
    expect(screen.queryByText("Toolbar Guide")).not.toBeInTheDocument();
  });

  it("does not render a keyboard shortcuts section", () => {
    render(<OptionsApp />);
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
    expect(screen.queryByText("Shift + Alt + F")).not.toBeInTheDocument();
    expect(screen.queryByText("Shift + Alt + P")).not.toBeInTheDocument();
  });

  it("toggles language to Arabic and back", () => {
    render(<OptionsApp />);

    const langBtn = screen.getByRole("button", { name: /التبديل/i });
    fireEvent.click(langBtn);

    expect(screen.getByText("نظّف المسرح. احتفظ بالقصة.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "كيف يعمل" })).toBeInTheDocument();
    expect(screen.getByText("تجميد الصفحة")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "كيف يعمل" }));
    expect(screen.getByText("دليل الأزرار")).toBeInTheDocument();
    expect(screen.getByText("تجميد / إلغاء التجميد")).toBeInTheDocument();

    const backBtn = screen.getByRole("button", { name: /Switch to English/i });
    fireEvent.click(backBtn);
    expect(screen.getByText("Clean the stage. Keep the story.")).toBeInTheDocument();
  });

  it("renders footer", () => {
    render(<OptionsApp />);
    expect(screen.getByText("Parotia — Open source Chrome extension")).toBeInTheDocument();
    expect(screen.getByText("View on GitHub")).toBeInTheDocument();
  });
});
