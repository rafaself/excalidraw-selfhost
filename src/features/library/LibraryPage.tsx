import { navigateTo } from "../../app/router";

const demoDiagramId = "demo";

export function LibraryPage() {
  return (
    <main className="library-page">
      <section className="library-card">
        <div className="eyebrow">Self-hosted Excalidraw</div>
        <h1>Your diagram workspace</h1>
        <p>
          The editor bootstrap is ready. Workspace and R2 persistence will plug
          into this library boundary without changing the editor integration.
        </p>

        <div className="demo-diagram">
          <div>
            <strong>Demo canvas</strong>
            <span>Temporary local scene for validating the editor.</span>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => navigateTo(`/editor/${demoDiagramId}`)}
          >
            Open demo canvas
          </button>
        </div>
      </section>
    </main>
  );
}
