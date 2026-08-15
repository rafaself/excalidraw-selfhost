import { useAppRoute } from "./app/router";
import { EditorPage } from "./features/editor/EditorPage";
import { LibraryPage } from "./features/library/LibraryPage";

export function App() {
  const route = useAppRoute();

  if (route.name === "editor") {
    const editorKey = `${route.workspaceId}:${route.diagramId}`;

    return (
      <EditorPage
        key={editorKey}
        workspaceId={route.workspaceId}
        diagramId={route.diagramId}
      />
    );
  }

  return <LibraryPage selectedWorkspaceId={route.workspaceId} />;
}
