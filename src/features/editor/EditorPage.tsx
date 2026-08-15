import { Excalidraw } from "@excalidraw/excalidraw";
import { navigateTo } from "../../app/router";

type EditorPageProps = {
  diagramId: string;
};

export function EditorPage({ diagramId }: EditorPageProps) {
  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <button className="secondary-button" type="button" onClick={() => navigateTo("/")}>
          ← Back
        </button>
        <div className="editor-title">
          <strong>Demo canvas</strong>
          <span>{diagramId}</span>
        </div>
      </header>

      <div className="editor-canvas" aria-label="Excalidraw editor">
        <Excalidraw />
      </div>
    </main>
  );
}
