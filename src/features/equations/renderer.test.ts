import { describe, expect, it } from "vitest";
import { renderEquation } from "./renderer";

describe("equation renderer", () => {
  it("renders structured TeX as a standalone SVG", () => {
    const result = renderEquation(String.raw`\frac{a}{\sqrt{b}} + x^2_i`, "#1e1e1e");

    expect(result.latex).toBe(String.raw`\frac{a}{\sqrt{b}} + x^2_i`);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.svg).toMatch(/^<svg\b/);
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.svg).toContain('color="#1e1e1e"');
    expect(result.svg).toContain(`width="${result.width}px"`);
    expect(result.svg).toContain(`height="${result.height}px"`);
    expect(result.svg).not.toContain("<mjx-container");
    expect(result.svg).not.toContain("foreignObject");
    expect(result.svg).not.toContain("url(");
    expect(result.svg).not.toMatch(/\b(?:href|src)=\"(?!#)/);
  });

  it.each(["", "   "]) ("rejects blank LaTeX: %j", (latex) => {
    expect(() => renderEquation(latex, "#1e1e1e")).toThrow(
      "Enter an equation before inserting it.",
    );
  });

  it("rejects an unavailable equation color", () => {
    expect(() => renderEquation("x", "  ")).toThrow(
      "Equation color is unavailable.",
    );
  });

  it("surfaces MathJax parse errors", () => {
    expect(() => renderEquation(String.raw`\notacommand`, "#1e1e1e")).toThrow();
  });
});
