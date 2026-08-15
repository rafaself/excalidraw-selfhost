const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_NAME_LENGTH = 120;

export type WorkspaceMetadata = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type DiagramMetadata = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ExcalidrawDocument = {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown>;
  [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

export function isExcalidrawDocument(value: unknown): value is ExcalidrawDocument {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === "excalidraw" &&
    typeof value.version === "number" &&
    Number.isFinite(value.version) &&
    Array.isArray(value.elements) &&
    isRecord(value.appState) &&
    (value.files === undefined || isRecord(value.files))
  );
}

export function createEmptyExcalidrawDocument(): ExcalidrawDocument {
  return {
    type: "excalidraw",
    version: 2,
    source: "excalidraw-selfhost",
    elements: [],
    appState: {},
    files: {},
  };
}
