import { describe, expect, it } from "vitest";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { isEquationAssetAvailable } from "./assets";

const fileId = "equation-file" as FileId;
const healthyFile = {
  id: fileId,
  mimeType: "image/svg+xml" as const,
  dataURL: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  created: 1,
  version: 1,
};

describe("equation asset availability", () => {
  it("accepts a non-empty self-contained SVG file", () => {
    const files = { [fileId]: healthyFile } as BinaryFiles;

    expect(isEquationAssetAvailable(fileId, files)).toBe(true);
  });

  it.each([
    null,
    "missing" as FileId,
  ])("rejects a missing file reference: %s", (missingFileId) => {
    expect(isEquationAssetAvailable(missingFileId, {})).toBe(false);
  });

  it("rejects unusable file content", () => {
    expect(
      isEquationAssetAvailable(fileId, {
        [fileId]: { ...healthyFile, mimeType: "image/png" },
      } as BinaryFiles),
    ).toBe(false);
    expect(
      isEquationAssetAvailable(fileId, {
        [fileId]: { ...healthyFile, dataURL: "" },
      } as BinaryFiles),
    ).toBe(false);
  });
});
