import { useEffect, useState } from "react";

export type AppRoute =
  | { name: "library" }
  | { name: "editor"; diagramId: string };

function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#/, "") || "/";
  const editorMatch = path.match(/^\/editor\/([^/]+)$/);

  if (editorMatch) {
    return {
      name: "editor",
      diagramId: decodeURIComponent(editorMatch[1]),
    };
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
