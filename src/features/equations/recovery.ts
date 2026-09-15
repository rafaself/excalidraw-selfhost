import {
  CaptureUpdateAction,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createEquationFile } from "./image";
import { getEquationData } from "./metadata";
import { renderEquation } from "./renderer";

const MAX_EQUATION_RECOVERY_COUNT = 32;

export type EquationAssetRecoveryResult = {
  recoveredCount: number;
  failedCount: number;
  skippedCount: number;
};

type SceneImageElement = Extract<
  ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>[number],
  { type: "image" }
>;

type RecoveryCandidate = {
  element: SceneImageElement;
  latex: string;
};

type PreparedRecovery = {
  elementId: string;
  latex: string;
  file: Awaited<ReturnType<typeof createEquationFile>>;
};

function isUnavailableEquationFile(
  element: SceneImageElement,
  files: ReturnType<ExcalidrawImperativeAPI["getFiles"]>,
): boolean {
  if (element.fileId === null) {
    return true;
  }

  const file = files[element.fileId];

  return (
    file === undefined ||
    file.mimeType !== "image/svg+xml" ||
    typeof file.dataURL !== "string" ||
    file.dataURL.trim() === ""
  );
}

function getMissingEquationCandidates(
  excalidrawAPI: ExcalidrawImperativeAPI,
): { candidates: RecoveryCandidate[]; skippedCount: number } {
  const files = excalidrawAPI.getFiles();
  const missing = excalidrawAPI
    .getSceneElements()
    .filter(
      (element): element is SceneImageElement =>
        element.type === "image" && getEquationData(element) !== null,
    )
    .filter((element) => isUnavailableEquationFile(element, files))
    .map((element) => {
      const data = getEquationData(element);
      return data ? { element, latex: data.latex } : null;
    })
    .filter((candidate): candidate is RecoveryCandidate => candidate !== null);

  return {
    candidates: missing.slice(0, MAX_EQUATION_RECOVERY_COUNT),
    skippedCount: Math.max(0, missing.length - MAX_EQUATION_RECOVERY_COUNT),
  };
}

export async function recoverMissingEquationAssets(
  excalidrawAPI: ExcalidrawImperativeAPI,
): Promise<EquationAssetRecoveryResult> {
  const { candidates, skippedCount } = getMissingEquationCandidates(excalidrawAPI);
  let failedCount = 0;
  const prepared: PreparedRecovery[] = [];

  for (const candidate of candidates) {
    try {
      const render = renderEquation(candidate.latex, candidate.element.strokeColor);
      const file = await createEquationFile(render);
      prepared.push({ elementId: candidate.element.id, latex: candidate.latex, file });
    } catch {
      failedCount += 1;
    }
  }

  if (prepared.length === 0) {
    return { recoveredCount: 0, failedCount, skippedCount };
  }

  const currentFiles = excalidrawAPI.getFiles();
  const currentElements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const filesToAdd: PreparedRecovery["file"][] = [];
  const recoveries = new Map<string, PreparedRecovery>();

  for (const recovery of prepared) {
    const element = currentElements.find(
      (candidate) => candidate.id === recovery.elementId && !candidate.isDeleted,
    );

    if (!element || element.type !== "image") {
      continue;
    }

    const data = getEquationData(element);

    if (
      !data ||
      data.latex !== recovery.latex ||
      !isUnavailableEquationFile(element, currentFiles)
    ) {
      continue;
    }

    recoveries.set(element.id, recovery);
    filesToAdd.push(recovery.file);
  }

  if (recoveries.size === 0) {
    return { recoveredCount: 0, failedCount, skippedCount };
  }

  const updatedElements = currentElements.map((element) => {
    const recovery = recoveries.get(element.id);

    if (!recovery || element.isDeleted || element.type !== "image") {
      return element;
    }

    return newElementWith(element, {
      fileId: recovery.file.id,
      status: "pending",
    });
  });

  try {
    excalidrawAPI.addFiles(filesToAdd);
    excalidrawAPI.updateScene({
      elements: updatedElements,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  } catch {
    return {
      recoveredCount: 0,
      failedCount: failedCount + recoveries.size,
      skippedCount,
    };
  }

  return {
    recoveredCount: recoveries.size,
    failedCount,
    skippedCount,
  };
}
