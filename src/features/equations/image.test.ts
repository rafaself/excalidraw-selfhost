import { describe, expect, it, vi } from "vitest";
import type { DataURL } from "@excalidraw/excalidraw/types";
import type { EquationRenderResult } from "./models";

const mocks = vi.hoisted(() => ({
  convertToExcalidrawElements: vi.fn(),
  getDataURL: vi.fn(),
}));

vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: mocks.convertToExcalidrawElements,
  getDataURL: mocks.getDataURL,
  MIME_TYPES: { svg: "image/svg+xml" },
}));

import { createEquationFile, createEquationImage } from "./image";

const render: EquationRenderResult = {
  latex: "x^2",
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  width: 40,
  height: 20,
};

describe("equation image conversion", () => {
  it("creates a self-contained SVG binary file", async () => {
    mocks.getDataURL.mockResolvedValue(
      "data:image/svg+xml;base64,PHN2Zy8+" as DataURL,
    );

    const file = await createEquationFile(render);

    expect(file).toMatchObject({
      mimeType: "image/svg+xml",
      dataURL: "data:image/svg+xml;base64,PHN2Zy8+",
      version: 1,
    });
    expect(file.id).toEqual(expect.any(String));
    expect(mocks.getDataURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("attaches source metadata to the generated image element", async () => {
    mocks.getDataURL.mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+" as DataURL);
    mocks.convertToExcalidrawElements.mockImplementation(([element]) => [
      { ...element, id: "equation-element", type: "image" },
    ]);

    const result = await createEquationImage(render, { x: 12, y: 24 }, "#1e1e1e");

    expect(result.element).toMatchObject({
      type: "image",
      fileId: result.file.id,
    });
    expect(result.element.customData).toEqual({
      equation: { version: 1, latex: "x^2" },
    });
    expect(mocks.convertToExcalidrawElements).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: "image",
          x: 12,
          y: 24,
          width: 40,
          height: 20,
          strokeColor: "#1e1e1e",
          customData: { equation: { version: 1, latex: "x^2" } },
        }),
      ],
      { regenerateIds: false },
    );
  });
});
