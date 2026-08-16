import {
  createEmptyExcalidrawDocument,
  isExcalidrawDocument,
  type DiagramMetadata,
  type ExcalidrawDocument,
  type WorkspaceMetadata,
} from "./domain";

export interface AppEnv {
  DIAGRAMS: R2Bucket;
}

const WORKSPACES_PREFIX = "workspaces/";
const R2_LIST_PAGE_SIZE = 1000;
const METADATA_READ_CONCURRENCY = 8;
const DELETE_BATCH_SIZE = 1000;

function workspacePrefix(workspaceId: string): string {
  return `${WORKSPACES_PREFIX}${workspaceId}/`;
}

function workspaceMetadataKey(workspaceId: string): string {
  return `${workspacePrefix(workspaceId)}meta.json`;
}

function diagramsPrefix(workspaceId: string): string {
  return `${workspacePrefix(workspaceId)}diagrams/`;
}

function diagramPrefix(workspaceId: string, diagramId: string): string {
  return `${diagramsPrefix(workspaceId)}${diagramId}/`;
}

function diagramMetadataKey(workspaceId: string, diagramId: string): string {
  return `${diagramPrefix(workspaceId, diagramId)}meta.json`;
}

function diagramDocumentKey(workspaceId: string, diagramId: string): string {
  return `${diagramPrefix(workspaceId, diagramId)}document.excalidraw`;
}

async function readJsonObject<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const object = await bucket.get(key);

  if (!object) {
    return null;
  }

  return JSON.parse(await object.text()) as T;
}

async function putJsonObject(bucket: R2Bucket, key: string, value: unknown): Promise<void> {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
  });
}

async function deleteKeys(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(index, index + DELETE_BATCH_SIZE));
  }
}

async function mapWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function latestTimestamp(metadataTimestamp: string, documentUploaded?: Date): string {
  if (!documentUploaded) {
    return metadataTimestamp;
  }

  const metadataTime = Date.parse(metadataTimestamp);
  if (!Number.isFinite(metadataTime) || documentUploaded.getTime() > metadataTime) {
    return documentUploaded.toISOString();
  }

  return metadataTimestamp;
}

type DiagramListEntry = {
  metadataKey?: string;
  documentUploaded?: Date;
};

function recordDiagramObject(
  prefix: string,
  object: R2Object,
  entries: Map<string, DiagramListEntry>,
): void {
  const relativeKey = object.key.slice(prefix.length);
  const separatorIndex = relativeKey.indexOf("/");

  if (separatorIndex <= 0) {
    return;
  }

  const diagramId = relativeKey.slice(0, separatorIndex);
  const objectName = relativeKey.slice(separatorIndex + 1);

  if (objectName !== "meta.json" && objectName !== "document.excalidraw") {
    return;
  }

  const entry = entries.get(diagramId) ?? {};

  if (objectName === "meta.json") {
    entry.metadataKey = object.key;
  } else {
    entry.documentUploaded = object.uploaded;
  }

  entries.set(diagramId, entry);
}

export async function listWorkspaces(bucket: R2Bucket): Promise<WorkspaceMetadata[]> {
  const workspaces: WorkspaceMetadata[] = [];
  let cursor: string | undefined;

  do {
    const result = await bucket.list({
      prefix: WORKSPACES_PREFIX,
      delimiter: "/",
      limit: R2_LIST_PAGE_SIZE,
      cursor,
    });
    const pageWorkspaces = await mapWithConcurrency(
      result.delimitedPrefixes,
      METADATA_READ_CONCURRENCY,
      (prefix) => readJsonObject<WorkspaceMetadata>(bucket, `${prefix}meta.json`),
    );

    workspaces.push(
      ...pageWorkspaces.filter(
        (metadata): metadata is WorkspaceMetadata => metadata !== null,
      ),
    );
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return workspaces.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getWorkspace(
  bucket: R2Bucket,
  workspaceId: string,
): Promise<WorkspaceMetadata | null> {
  return readJsonObject<WorkspaceMetadata>(bucket, workspaceMetadataKey(workspaceId));
}

export async function createWorkspace(
  bucket: R2Bucket,
  name: string,
): Promise<WorkspaceMetadata> {
  const now = new Date().toISOString();
  const workspace: WorkspaceMetadata = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  await putJsonObject(bucket, workspaceMetadataKey(workspace.id), workspace);
  return workspace;
}

export async function renameWorkspace(
  bucket: R2Bucket,
  workspaceId: string,
  name: string,
): Promise<WorkspaceMetadata | null> {
  const current = await getWorkspace(bucket, workspaceId);

  if (!current) {
    return null;
  }

  const updated: WorkspaceMetadata = {
    ...current,
    name,
    updatedAt: new Date().toISOString(),
  };

  await putJsonObject(bucket, workspaceMetadataKey(workspaceId), updated);
  return updated;
}

export async function deleteWorkspace(bucket: R2Bucket, workspaceId: string): Promise<boolean> {
  let cursor: string | undefined;
  let foundObjects = false;

  do {
    const result = await bucket.list({
      prefix: workspacePrefix(workspaceId),
      limit: R2_LIST_PAGE_SIZE,
      cursor,
    });
    const keys = result.objects.map((object) => object.key);

    if (keys.length > 0) {
      foundObjects = true;
      await deleteKeys(bucket, keys);
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return foundObjects;
}

export async function listDiagrams(
  bucket: R2Bucket,
  workspaceId: string,
): Promise<DiagramMetadata[]> {
  const prefix = diagramsPrefix(workspaceId);
  const entries = new Map<string, DiagramListEntry>();
  let cursor: string | undefined;

  do {
    const result = await bucket.list({
      prefix,
      limit: R2_LIST_PAGE_SIZE,
      cursor,
    });

    for (const object of result.objects) {
      recordDiagramObject(prefix, object, entries);
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  const diagrams = await mapWithConcurrency(
    [...entries.values()].filter(
      (entry): entry is DiagramListEntry & { metadataKey: string } =>
        entry.metadataKey !== undefined,
    ),
    METADATA_READ_CONCURRENCY,
    async (entry) => {
      const metadata = await readJsonObject<DiagramMetadata>(bucket, entry.metadataKey);

      if (!metadata) {
        return null;
      }

      return {
        ...metadata,
        updatedAt: latestTimestamp(metadata.updatedAt, entry.documentUploaded),
      };
    },
  );

  return diagrams
    .filter((metadata): metadata is DiagramMetadata => metadata !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createDiagram(
  bucket: R2Bucket,
  workspaceId: string,
  name: string,
): Promise<DiagramMetadata | null> {
  const workspace = await getWorkspace(bucket, workspaceId);

  if (!workspace) {
    return null;
  }

  const now = new Date().toISOString();
  const diagram: DiagramMetadata = {
    id: crypto.randomUUID(),
    workspaceId,
    name,
    createdAt: now,
    updatedAt: now,
  };
  const document = createEmptyExcalidrawDocument();
  const documentKey = diagramDocumentKey(workspaceId, diagram.id);

  await putJsonObject(bucket, documentKey, document);

  try {
    await putJsonObject(bucket, diagramMetadataKey(workspaceId, diagram.id), diagram);
  } catch (error) {
    await bucket.delete(documentKey);
    throw error;
  }

  return diagram;
}

export async function getDiagram(
  bucket: R2Bucket,
  workspaceId: string,
  diagramId: string,
): Promise<{ metadata: DiagramMetadata; document: ExcalidrawDocument } | null> {
  const [metadata, document] = await Promise.all([
    readJsonObject<DiagramMetadata>(bucket, diagramMetadataKey(workspaceId, diagramId)),
    readJsonObject<unknown>(bucket, diagramDocumentKey(workspaceId, diagramId)),
  ]);

  if (!metadata || document === null) {
    return null;
  }

  if (!isExcalidrawDocument(document)) {
    throw new Error(`Stored diagram ${diagramId} is not a valid Excalidraw document`);
  }

  return { metadata, document };
}

export async function renameDiagram(
  bucket: R2Bucket,
  workspaceId: string,
  diagramId: string,
  name: string,
): Promise<DiagramMetadata | null> {
  const current = await readJsonObject<DiagramMetadata>(
    bucket,
    diagramMetadataKey(workspaceId, diagramId),
  );

  if (!current) {
    return null;
  }

  const updated: DiagramMetadata = {
    ...current,
    name,
    updatedAt: new Date().toISOString(),
  };

  await putJsonObject(bucket, diagramMetadataKey(workspaceId, diagramId), updated);
  return updated;
}

export async function saveDiagram(
  bucket: R2Bucket,
  workspaceId: string,
  diagramId: string,
  document: ExcalidrawDocument,
): Promise<DiagramMetadata | null> {
  const current = await readJsonObject<DiagramMetadata>(
    bucket,
    diagramMetadataKey(workspaceId, diagramId),
  );

  if (!current) {
    return null;
  }

  await putJsonObject(bucket, diagramDocumentKey(workspaceId, diagramId), document);

  const updated: DiagramMetadata = {
    ...current,
    updatedAt: new Date().toISOString(),
  };
  return updated;
}

export async function deleteDiagram(
  bucket: R2Bucket,
  workspaceId: string,
  diagramId: string,
): Promise<boolean> {
  const metadataKey = diagramMetadataKey(workspaceId, diagramId);
  const current = await readJsonObject<DiagramMetadata>(bucket, metadataKey);

  if (!current) {
    return false;
  }

  await bucket.delete([metadataKey, diagramDocumentKey(workspaceId, diagramId)]);
  return true;
}
