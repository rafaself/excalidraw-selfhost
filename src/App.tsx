import { EditorPage } from "./features/editor/EditorPage";
import { LibraryPage } from "./features/library/LibraryPage";
import { useAppRoute } from "./app/router";

export function App() {
  const route = useAppRoute();

  if (route.name === "editor") {
    return <EditorPage diagramId={route.diagramId} />;
  }

  return <LibraryPage />;
}
