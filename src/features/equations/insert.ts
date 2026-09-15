import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createEquationImage } from "./image";
import type { EquationScenePosition } from "./models";
import { renderEquation } from "./renderer";

export async function insertEquation(
  excalidrawAPI: ExcalidrawImperativeAPI,
  latex: string,
  scenePosition: EquationScenePosition,
): Promise<void> {
  const render = renderEquation(latex);
  const image = await createEquationImage(render, {
    x: scenePosition.x,
    y: scenePosition.y,
  });

  excalidrawAPI.addFiles([image.file]);
  excalidrawAPI.updateScene({
    elements: [...excalidrawAPI.getSceneElements(), image.element],
    appState: {
      selectedElementIds: { [image.element.id]: true },
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
