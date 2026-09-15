import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  newElementWith: (element: object, updates: object) => ({ ...element, ...updates }),
}));

import { scaleEquationDimension } from "./update";

describe("equation update sizing", () => {
  it("preserves the current visual scale when the render changes", () => {
    expect(scaleEquationDimension(200, 100, 150)).toBe(300);
    expect(scaleEquationDimension(1, 3, 1)).toBe(1);
  });

  it("uses the next natural dimension when the previous render is unusable", () => {
    expect(scaleEquationDimension(200, 0, 150)).toBe(150);
    expect(scaleEquationDimension(Number.NaN, 100, 150)).toBe(150);
    expect(scaleEquationDimension(200, -1, 150)).toBe(150);
  });
});
