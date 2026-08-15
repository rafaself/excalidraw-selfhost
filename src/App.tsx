import { useAppRoute } from "./app/router";
import { EditorPage } from "./features/editor/EditorPage";
import { LibraryPage } from "./features/library/LibraryPage";

export function App() {
  const route = useAppRoute();

  if (route.name === "editor") {
    return <EditorPage workspaceId={route.workspaceId} diagramId={route.diagramId} />;
  }

  return <LibraryPage selectedWorkspaceId={route.workspaceId} />;
}
