import { describe, expect, it, vi } from "vitest";
import type { ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";

vi.mock("@excalidraw/excalidraw", () => ({
  sceneCoordsToViewportCoords: ({ sceneX, sceneY }: { sceneX: number; sceneY: number }) => ({
    x: sceneX,
    y: sceneY,
  }),
  viewportCoordsToSceneCoords: ({ clientX, clientY }: { clientX: number; clientY: number }) => ({
    sceneX: clientX,
    sceneY: clientY,
  }),
}));

import {
  isEquationCanvasClick,
  isScenePositionInsideEquation,
} from "./placement";

const element = {
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  angle: 0,
} as ExcalidrawImageElement;

describe("equation placement", () => {
  it("accepts points inside an unrotated equation", () => {
    expect(isScenePositionInsideEquation({ x: 10, y: 20 }, element)).toBe(true);
    expect(isScenePositionInsideEquation({ x: 110, y: 60 }, element)).toBe(true);
    expect(isScenePositionInsideEquation({ x: 111, y: 60 }, element)).toBe(false);
  });

  it("accounts for rotation when testing a scene point", () => {
    const rotated = { ...element, angle: Math.PI / 2 };

    expect(isScenePositionInsideEquation({ x: 60, y: -10 }, rotated)).toBe(true);
    expect(isScenePositionInsideEquation({ x: 110, y: 60 }, rotated)).toBe(false);
  });

  it("recognizes only primary-button clicks within the movement threshold", () => {
    expect(
      isEquationCanvasClick(
        { x: 100, y: 200 },
        { button: 0, clientX: 104, clientY: 203 },
      ),
    ).toBe(true);
    expect(
      isEquationCanvasClick(
        { x: 100, y: 200 },
        { button: 0, clientX: 107, clientY: 200 },
      ),
    ).toBe(false);
    expect(
      isEquationCanvasClick(
        { x: 100, y: 200 },
        { button: 2, clientX: 100, clientY: 200 },
      ),
    ).toBe(false);
  });
});
