import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import type {
  EquationScenePosition,
  EquationViewportPosition,
} from "./models";

type CoordinateAppState = Pick<
  AppState,
  "offsetLeft" | "offsetTop" | "scrollX" | "scrollY" | "zoom"
>;

const POINTER_CLICK_THRESHOLD_PX = 6;

export function scenePositionToViewportPosition(
  scenePosition: EquationScenePosition,
  appState: CoordinateAppState,
): EquationViewportPosition {
  return sceneCoordsToViewportCoords(
    { sceneX: scenePosition.x, sceneY: scenePosition.y },
    appState,
  );
}

export function viewportPositionToScenePosition(
  viewportPosition: EquationViewportPosition,
  appState: CoordinateAppState,
): EquationScenePosition {
  return viewportCoordsToSceneCoords(
    { clientX: viewportPosition.x, clientY: viewportPosition.y },
    appState,
  );
}

export function isEquationCanvasClick(
  pointerDownPosition: EquationViewportPosition,
  event: Pick<PointerEvent, "button" | "clientX" | "clientY">,
): boolean {
  if (event.button !== 0) {
    return false;
  }

  const distanceInViewportPixels = Math.hypot(
    event.clientX - pointerDownPosition.x,
    event.clientY - pointerDownPosition.y,
  );

  return distanceInViewportPixels <= POINTER_CLICK_THRESHOLD_PX;
}

export function isScenePositionInsideEquation(
  scenePosition: EquationScenePosition,
  element: ExcalidrawImageElement,
): boolean {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const deltaX = scenePosition.x - centerX;
  const deltaY = scenePosition.y - centerY;
  const cos = Math.cos(element.angle);
  const sin = Math.sin(element.angle);
  const localX = deltaX * cos + deltaY * sin + element.width / 2;
  const localY = -deltaX * sin + deltaY * cos + element.height / 2;

  return (
    localX >= 0 &&
    localX <= element.width &&
    localY >= 0 &&
    localY <= element.height
  );
}
