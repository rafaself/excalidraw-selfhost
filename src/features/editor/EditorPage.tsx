import { Excalidraw } from "@excalidraw/excalidraw";
import { navigateTo, workspacePath } from "../../app/router";

type EditorPageProps = {
  workspaceId: string;
  diagramId: string;
};

export function EditorPage({ workspaceId, diagramId }: EditorPageProps) {
  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <button
          className="secondary-button"
          type="button"
          onClick={() => navigateTo(workspacePath(workspaceId))}
        >
          ← Back
        </button>
        <div className="editor-title">
          <strong>Diagram</strong>
          <span>{diagramId}</span>
        </div>
      </header>

      <div className="editor-canvas" aria-label="Excalidraw editor">
        <Excalidraw />
      </div>
    </main>
  );
}
