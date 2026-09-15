import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/excalidraw/element/types";
import type { EquationData } from "./models";

function isEquationData(value: unknown): value is EquationData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const data = value as { version?: unknown; latex?: unknown };

  return data.version === 1 && typeof data.latex === "string" && data.latex.trim() !== "";
}

export function createEquationData(latex: string): EquationData {
  const trimmedLatex = latex.trim();

  if (!trimmedLatex) {
    throw new Error("Equation metadata requires a LaTeX value.");
  }

  return { version: 1, latex: trimmedLatex };
}

export function getEquationData(element: ExcalidrawElement): EquationData | null {
  if (element.type !== "image") {
    return null;
  }

  const equation = element.customData?.equation;

  return isEquationData(equation)
    ? { version: 1, latex: equation.latex }
    : null;
}

export function isEquationElement(
  element: ExcalidrawElement,
): element is ExcalidrawImageElement {
  return getEquationData(element) !== null;
}
