export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Diagram = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as ApiErrorBody | T | null;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiClientError(
      response.status,
      errorBody?.error?.code ?? "request_failed",
      errorBody?.error?.message ?? `Request failed with status ${response.status}`,
    );
  }

  return body as T;
}

export function listWorkspaces(signal?: AbortSignal): Promise<{ workspaces: Workspace[] }> {
  return requestJson("/api/workspaces", { signal });
}

export function createWorkspace(name: string): Promise<{ workspace: Workspace }> {
  return requestJson("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameWorkspace(
  workspaceId: string,
  name: string,
): Promise<{ workspace: Workspace }> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteWorkspace(workspaceId: string): Promise<void> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
  });
}

export function listDiagrams(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<{ diagrams: Diagram[] }> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/diagrams`, { signal });
}

export function createDiagram(
  workspaceId: string,
  name: string,
): Promise<{ diagram: Diagram }> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/diagrams`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameDiagram(
  workspaceId: string,
  diagramId: string,
  name: string,
): Promise<{ diagram: Diagram }> {
  return requestJson(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/diagrams/${encodeURIComponent(diagramId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
  );
}

export function deleteDiagram(workspaceId: string, diagramId: string): Promise<void> {
  return requestJson(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/diagrams/${encodeURIComponent(diagramId)}`,
    { method: "DELETE" },
  );
}
