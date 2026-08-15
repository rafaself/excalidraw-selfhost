import { useEffect, useState } from "react";

export type AppRoute =
  | { name: "library"; workspaceId?: string }
  | { name: "editor"; workspaceId: string; diagramId: string };

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, "") || "/";
  const editorMatch = path.match(/^\/workspaces\/([^/]+)\/diagrams\/([^/]+)$/);

  if (editorMatch) {
    const workspaceId = decodeSegment(editorMatch[1]);
    const diagramId = decodeSegment(editorMatch[2]);

    if (workspaceId && diagramId) {
      return { name: "editor", workspaceId, diagramId };
    }
  }

  const workspaceMatch = path.match(/^\/workspaces\/([^/]+)$/);

  if (workspaceMatch) {
    const workspaceId = decodeSegment(workspaceMatch[1]);

    if (workspaceId) {
      return { name: "library", workspaceId };
    }
  }

  return { name: "library" };
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/");
    }

    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}

export function navigateTo(path: string) {
  window.location.hash = path;
}

export function workspacePath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

export function diagramPath(workspaceId: string, diagramId: string): string {
  return `${workspacePath(workspaceId)}/diagrams/${encodeURIComponent(diagramId)}`;
}
