import {
  CaptureUpdateAction,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createEquationData, getEquationData } from "./metadata";
import { createEquationFile } from "./image";
import { renderEquation } from "./renderer";

function findEquationElement(
  excalidrawAPI: ExcalidrawImperativeAPI,
  elementId: string,
): { element: ExcalidrawImageElement; latex: string } {
  const element = excalidrawAPI
    .getSceneElements()
    .find((candidate) => candidate.id === elementId);

  if (!element || element.type !== "image") {
    throw new Error("The selected equation is no longer available.");
  }

  const equation = getEquationData(element);

  if (!equation) {
    throw new Error("The selected image is not an editable equation.");
  }

  return { element, latex: equation.latex };
}

function scaledDimension(
  currentDimension: number,
  previousDimension: number,
  nextDimension: number,
): number {
  const scale = currentDimension / previousDimension;

  if (!Number.isFinite(scale) || scale <= 0) {
    return nextDimension;
  }

  return Math.max(1, Math.round(nextDimension * scale));
}

export async function updateEquation(
  excalidrawAPI: ExcalidrawImperativeAPI,
  elementId: string,
  latex: string,
): Promise<void> {
  const { element, latex: previousLatex } = findEquationElement(
    excalidrawAPI,
    elementId,
  );
  const previousRender = renderEquation(previousLatex, element.strokeColor);
  const nextRender = renderEquation(latex, element.strokeColor);
  const file = await createEquationFile(nextRender);
  const updatedElement = newElementWith(element, {
    fileId: file.id,
    width: scaledDimension(element.width, previousRender.width, nextRender.width),
    height: scaledDimension(element.height, previousRender.height, nextRender.height),
    crop: null,
    status: "pending",
    customData: {
      ...element.customData,
      equation: createEquationData(nextRender.latex),
    },
  });
  const elements = excalidrawAPI
    .getSceneElementsIncludingDeleted()
    .map((candidate) => (candidate.id === element.id ? updatedElement : candidate));

  excalidrawAPI.addFiles([file]);
  excalidrawAPI.updateScene({
    elements,
    appState: {
      selectedElementIds: { [element.id]: true },
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
