import { describe, expect, it } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  createEquationData,
  getEquationData,
  isEquationElement,
} from "./metadata";

function makeElement(
  type: "image" | "rectangle",
  customData?: unknown,
): ExcalidrawElement {
  return { type, customData } as unknown as ExcalidrawElement;
}

describe("equation metadata", () => {
  it("creates canonical version 1 data", () => {
    expect(createEquationData("  x^2  ")).toEqual({ version: 1, latex: "x^2" });
  });

  it("rejects empty source", () => {
    expect(() => createEquationData(" \n ")).toThrow(
      "Equation metadata requires a LaTeX value.",
    );
  });

  it("detects a valid equation image", () => {
    const element = makeElement("image", {
      equation: { version: 1, latex: "\\frac{a}{b}" },
    });

    expect(isEquationElement(element)).toBe(true);
    expect(getEquationData(element)).toEqual({
      version: 1,
      latex: "\\frac{a}{b}",
    });
  });

  it.each([
    null,
    [],
    "equation",
    { version: 2, latex: "x" },
    { version: 1, latex: "" },
    { version: 1, latex: "   " },
    { latex: "x" },
  ])("rejects malformed or unsupported data: %j", (equation) => {
    const element = makeElement("image", { equation });

    expect(getEquationData(element)).toBeNull();
    expect(isEquationElement(element)).toBe(false);
  });

  it("ignores ordinary images and non-image elements", () => {
    const ordinaryImage = makeElement("image", { source: "photo" });
    const rectangle = makeElement("rectangle", {
      equation: { version: 1, latex: "x" },
    });

    expect(getEquationData(ordinaryImage)).toBeNull();
    expect(isEquationElement(ordinaryImage)).toBe(false);
    expect(getEquationData(rectangle)).toBeNull();
    expect(isEquationElement(rectangle)).toBe(false);
  });
});
