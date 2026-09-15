import type { FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

export function isEquationAssetAvailable(
  fileId: FileId | null,
  files: BinaryFiles,
): boolean {
  if (fileId === null) {
    return false;
  }

  const file = files[fileId];

  return (
    file !== undefined &&
    file.mimeType === "image/svg+xml" &&
    typeof file.dataURL === "string" &&
    file.dataURL.trim() !== ""
  );
}
