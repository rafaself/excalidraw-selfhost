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

async function listPrefixes(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const prefixes: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await bucket.list({
      prefix,
      delimiter: "/",
      cursor,
    });

    prefixes.push(...result.delimitedPrefixes);
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return prefixes;
}

async function listKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await bucket.list({ prefix, cursor });
    keys.push(...result.objects.map((object) => object.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return keys;
}

async function deleteKeys(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(index, index + DELETE_BATCH_SIZE));
  }
}

export async function listWorkspaces(bucket: R2Bucket): Promise<WorkspaceMetadata[]> {
  const prefixes = await listPrefixes(bucket, WORKSPACES_PREFIX);
  const workspaces: WorkspaceMetadata[] = [];

  for (const prefix of prefixes) {
    const metadata = await readJsonObject<WorkspaceMetadata>(bucket, `${prefix}meta.json`);
    if (metadata) {
      workspaces.push(metadata);
    }
  }

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
  const current = await getWorkspace(bucket, workspaceId);

  if (!current) {
    return false;
  }

  const keys = await listKeys(bucket, workspacePrefix(workspaceId));
  await deleteKeys(bucket, keys);
  return true;
}

export async function listDiagrams(
  bucket: R2Bucket,
  workspaceId: string,
): Promise<DiagramMetadata[]> {
  const prefixes = await listPrefixes(bucket, diagramsPrefix(workspaceId));
  const diagrams: DiagramMetadata[] = [];

  for (const prefix of prefixes) {
    const metadata = await readJsonObject<DiagramMetadata>(bucket, `${prefix}meta.json`);
    if (metadata) {
      diagrams.push(metadata);
    }
  }

  return diagrams.sort((left, right) => left.name.localeCompare(right.name));
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

  await putJsonObject(bucket, diagramMetadataKey(workspaceId, diagramId), updated);
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
