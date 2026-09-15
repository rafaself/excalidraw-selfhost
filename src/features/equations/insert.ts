import {
  CaptureUpdateAction,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createEquationImage } from "./image";
import { renderEquation } from "./renderer";

export async function insertEquation(
  excalidrawAPI: ExcalidrawImperativeAPI,
  latex: string,
): Promise<void> {
  const render = renderEquation(latex);
  const appState = excalidrawAPI.getAppState();
  const viewportCenter = viewportCoordsToSceneCoords(
    {
      clientX: appState.offsetLeft + appState.width / 2,
      clientY: appState.offsetTop + appState.height / 2,
    },
    appState,
  );
  const image = await createEquationImage(render, {
    x: viewportCenter.x - render.width / 2,
    y: viewportCenter.y - render.height / 2,
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
