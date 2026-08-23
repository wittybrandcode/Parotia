import { describe, expect, it } from "vitest";
import { validateBackgroundCommandShape } from "@shared/types";

describe("background command contracts", () => {
  it("rejects missing payload objects before property access", () => {
    expect(validateBackgroundCommandShape({ type: "GET_STATE" })).toBe("Payload must be an object");
  });

  it.each([
    { rect: { x: 0, y: 0, width: Number.NaN, height: 10 }, dpr: 1 },
    { rect: { x: 0, y: 0, width: -1, height: 10 }, dpr: 1 },
    { rect: { x: 0, y: 0, width: 10, height: 10 }, dpr: Number.POSITIVE_INFINITY },
  ])("rejects non-finite or non-positive region geometry", ({ rect, dpr }) => {
    expect(validateBackgroundCommandShape({
      type: "CAPTURE_REGION_CROP",
      payload: {
        sessionId: "session",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        rect,
        dpr,
      },
    })).toBe("Invalid region payload");
  });

  it("accepts a well-formed region crop", () => {
    expect(validateBackgroundCommandShape({
      type: "CAPTURE_REGION_CROP",
      payload: {
        sessionId: "session",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        rect: { x: 1, y: 2, width: 3, height: 4 },
        dpr: 2,
      },
    })).toBeNull();
  });

  it("accepts only finite on-screen geometry for a one-frame element crop", () => {
    const valid = {
      type: "CAPTURE_ELEMENT_CROP",
      payload: {
        sessionId: "session",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        rect: { left: 10, top: 20, width: 300, height: 200 },
        dpr: 2,
      },
    };
    expect(validateBackgroundCommandShape(valid)).toBeNull();
    expect(validateBackgroundCommandShape({
      ...valid,
      payload: { ...valid.payload, rect: { ...valid.payload.rect, top: -1 } },
    })).toBe("Invalid element rect");
    expect(validateBackgroundCommandShape({
      ...valid,
      payload: { ...valid.payload, dataUrl: "data:text/plain,not-png" },
    })).toBe("Invalid PNG data");
  });
});
