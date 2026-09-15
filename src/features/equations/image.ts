import {
  convertToExcalidrawElements,
  getDataURL,
  MIME_TYPES,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImageElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import { createEquationData } from "./metadata";
import type { EquationRenderResult } from "./models";

export type EquationImage = {
  file: BinaryFileData;
  element: ExcalidrawImageElement;
};

export async function createEquationImage(
  render: EquationRenderResult,
  position: { x: number; y: number },
  color: string,
): Promise<EquationImage> {
  const file = await createEquationFile(render);
  const [element] = convertToExcalidrawElements(
    [
      {
        type: "image",
        fileId: file.id,
        x: position.x,
        y: position.y,
        width: render.width,
        height: render.height,
        strokeColor: color,
        customData: {
          equation: createEquationData(render.latex),
        },
      },
    ],
    { regenerateIds: false },
  );

  if (!element || element.type !== "image") {
    throw new Error("Could not create the equation image element.");
  }

  return { file, element };
}

export async function createEquationFile(
  render: EquationRenderResult,
): Promise<BinaryFileData> {
  const fileId = crypto.randomUUID() as FileId;
  const dataURL = await getDataURL(
    new Blob([render.svg], { type: MIME_TYPES.svg }),
  );
  return {
    id: fileId,
    mimeType: MIME_TYPES.svg,
    dataURL,
    created: Date.now(),
    version: 1,
  };
}
