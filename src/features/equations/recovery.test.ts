import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { createEquationData } from "./metadata";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  newElementWith: (element: object, updates: object) => ({ ...element, ...updates }),
}));

const mocks = vi.hoisted(() => ({
  createEquationFile: vi.fn(),
  renderEquation: vi.fn(),
}));

vi.mock("./image", () => ({ createEquationFile: mocks.createEquationFile }));
vi.mock("./renderer", () => ({ renderEquation: mocks.renderEquation }));

import { recoverMissingEquationAssets } from "./recovery";

const latex = String.raw`\frac{a}{b}`;
const missingFileId = "missing-equation" as FileId;
const recoveredFileId = "recovered-equation" as FileId;

const render = {
  latex,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="40px" height="20px"/>',
  width: 40,
  height: 20,
};

const recoveredFile: BinaryFileData = {
  id: recoveredFileId,
  mimeType: "image/svg+xml",
  dataURL: "data:image/svg+xml;base64,PHN2Zy8+" as DataURL,
  created: 1,
  version: 1,
};

function makeEquationScene(fileId: FileId): ExcalidrawElement[] {
  return [
    {
      id: "equation-element",
      type: "image",
      fileId,
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      strokeColor: "#1e1e1e",
      isDeleted: false,
      customData: { equation: createEquationData(latex) },
    } as unknown as ExcalidrawElement,
  ];
}

function makeApi(
  initialElements: ExcalidrawElement[],
  initialFiles: BinaryFiles = {},
  options: { failOnAddFiles?: boolean; failOnUpdateScene?: boolean } = {},
): {
  api: ExcalidrawImperativeAPI;
  getElements: () => ExcalidrawElement[];
  updates: ExcalidrawElement[][];
} {
  let elements = initialElements;
  const files = { ...initialFiles };
  const updates: ExcalidrawElement[][] = [];
  type SceneUpdate = Parameters<ExcalidrawImperativeAPI["updateScene"]>[0];

  const api = {
    getFiles: () => files,
    getSceneElements: () => elements.filter((element) => !element.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    addFiles: (nextFiles: BinaryFileData[]) => {
      if (options.failOnAddFiles) {
        throw new Error("file insertion failed");
      }

      Object.assign(files, Object.fromEntries(nextFiles.map((file) => [file.id, file])));
    },
    updateScene: (update: SceneUpdate) => {
      if (options.failOnUpdateScene) {
        throw new Error("scene update failed");
      }

      if (update.elements) {
        elements = [...update.elements];
        updates.push(elements);
      }
    },
  } as unknown as ExcalidrawImperativeAPI;

  return { api, getElements: () => elements, updates };
}

describe("equation asset recovery", () => {
  beforeEach(() => {
    mocks.renderEquation.mockReset().mockReturnValue(render);
    mocks.createEquationFile.mockReset().mockResolvedValue(recoveredFile);
  });

  it("rebuilds a missing SVG without changing equation metadata", async () => {
    const fixture = makeApi(makeEquationScene(missingFileId));

    await expect(recoverMissingEquationAssets(fixture.api)).resolves.toEqual({
      recoveredCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });

    expect(fixture.getElements()[0]).toMatchObject({ fileId: recoveredFileId });
    expect(fixture.getElements()[0]?.customData).toEqual({
      equation: { version: 1, latex },
    });
    expect(fixture.updates).toHaveLength(1);
  });

  it("leaves healthy equation assets untouched", async () => {
    const fixture = makeApi(makeEquationScene(recoveredFileId), {
      [recoveredFileId]: recoveredFile,
    });

    await expect(recoverMissingEquationAssets(fixture.api)).resolves.toEqual({
      recoveredCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });

    expect(mocks.renderEquation).not.toHaveBeenCalled();
    expect(fixture.updates).toHaveLength(0);
  });

  it("reports render failures without mutating the scene", async () => {
    mocks.renderEquation.mockImplementationOnce(() => {
      throw new Error("render failed");
    });
    const fixture = makeApi(makeEquationScene(missingFileId));

    await expect(recoverMissingEquationAssets(fixture.api)).resolves.toEqual({
      recoveredCount: 0,
      failedCount: 1,
      skippedCount: 0,
    });

    expect(fixture.updates).toHaveLength(0);
  });

  it("reports insertion failures without mutating the scene", async () => {
    const fixture = makeApi(makeEquationScene(missingFileId), {}, {
      failOnAddFiles: true,
    });

    await expect(recoverMissingEquationAssets(fixture.api)).resolves.toEqual({
      recoveredCount: 0,
      failedCount: 1,
      skippedCount: 0,
    });

    expect(fixture.updates).toHaveLength(0);
  });
});
