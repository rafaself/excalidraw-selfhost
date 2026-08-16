import { type FormEvent, useEffect, useState } from "react";
import { diagramPath, navigateTo, workspacePath } from "../../app/router";
import { ThemeToggle } from "../../components/ThemeToggle";
import {
  createDiagram,
  createWorkspace,
  deleteDiagram,
  deleteWorkspace,
  listDiagrams,
  listWorkspaces,
  renameDiagram,
  renameWorkspace,
  type Diagram,
  type Workspace,
} from "../../services/api";

type LoadState = "loading" | "ready" | "error";

type LibraryPageProps = {
  selectedWorkspaceId?: string;
};

type DialogState =
  | {
      kind: "name";
      title: string;
      value: string;
      error?: string;
      submit: (name: string) => void | Promise<void>;
    }
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirm: () => void | Promise<void>;
    };

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

export function LibraryPage({ selectedWorkspaceId }: LibraryPageProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceLoadState, setWorkspaceLoadState] = useState<LoadState>("loading");
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [diagramLoadState, setDiagramLoadState] = useState<LoadState>("ready");
  const [diagramLoadError, setDiagramLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0);
  const [diagramReloadKey, setDiagramReloadKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const actionsDisabled = busyAction !== null;

  useEffect(() => {
    const controller = new AbortController();
    setWorkspaceLoadState("loading");
    setWorkspaceLoadError(null);

    void listWorkspaces(controller.signal)
      .then(({ workspaces: loadedWorkspaces }) => {
        setWorkspaces(sortByName(loadedWorkspaces));
        setWorkspaceLoadState("ready");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setWorkspaceLoadError(errorMessage(error));
          setWorkspaceLoadState("error");
        }
      });

    return () => controller.abort();
  }, [workspaceReloadKey]);

  useEffect(() => {
    if (workspaceLoadState !== "ready") {
      return;
    }

    if (workspaces.length === 0) {
      if (selectedWorkspaceId) {
        navigateTo("/");
      }
      return;
    }

    if (!selectedWorkspaceId || !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      navigateTo(workspacePath(workspaces[0].id));
    }
  }, [selectedWorkspaceId, workspaceLoadState, workspaces]);

  useEffect(() => {
    if (!selectedWorkspace) {
      setDiagrams([]);
      setDiagramLoadState("ready");
      setDiagramLoadError(null);
      return;
    }

    const controller = new AbortController();
    setDiagramLoadState("loading");
    setDiagramLoadError(null);

    void listDiagrams(selectedWorkspace.id, controller.signal)
      .then(({ diagrams: loadedDiagrams }) => {
        setDiagrams(sortByName(loadedDiagrams));
        setDiagramLoadState("ready");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDiagramLoadError(errorMessage(error));
          setDiagramLoadState("error");
        }
      });

    return () => controller.abort();
  }, [diagramReloadKey, selectedWorkspace?.id]);

  async function runAction<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusyAction(key);
    setActionError(null);

    try {
      return await action();
    } catch (error) {
      setActionError(errorMessage(error));
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  function openNameDialog(
    title: string,
    currentName: string,
    submit: (name: string) => void | Promise<void>,
  ) {
    setActionError(null);
    setDialog({ kind: "name", title, value: currentName, submit });
  }

  function openConfirmDialog(title: string, message: string, confirm: () => void | Promise<void>) {
    setActionError(null);
    setDialog({ kind: "confirm", title, message, confirm });
  }

  function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!dialog || dialog.kind !== "name") return;

    const name = dialog.value.trim();

    if (!name) {
      setDialog((current) =>
        current?.kind === "name" ? { ...current, error: "Name cannot be empty." } : current,
      );
      return;
    }

    const submit = dialog.submit;
    setDialog(null);
    void submit(name);
  }

  function handleDialogConfirm() {
    if (!dialog || dialog.kind !== "confirm") return;

    const confirm = dialog.confirm;
    setDialog(null);
    void confirm();
  }

  function handleCreateWorkspace() {
    openNameDialog("Create workspace", "", async (name) => {
      const result = await runAction("create-workspace", () => createWorkspace(name));
      if (!result) return;

      setWorkspaces((current) => sortByName([...current, result.workspace]));
      navigateTo(workspacePath(result.workspace.id));
    });
  }

  function handleRenameWorkspace(workspace: Workspace) {
    openNameDialog("Rename workspace", workspace.name, async (name) => {
      if (name === workspace.name) return;

      const result = await runAction(`rename-workspace-${workspace.id}`, () =>
        renameWorkspace(workspace.id, name),
      );
      if (!result) return;

      setWorkspaces((current) =>
        sortByName(current.map((item) => (item.id === workspace.id ? result.workspace : item))),
      );
    });
  }

  function handleDeleteWorkspace(workspace: Workspace) {
    openConfirmDialog(
      "Delete workspace",
      `Delete workspace “${workspace.name}” and all diagrams inside it? This cannot be undone.`,
      async () => {
        const result = await runAction(`delete-workspace-${workspace.id}`, async () => {
          await deleteWorkspace(workspace.id);
          return true;
        });
        if (!result) return;

        const remaining = workspaces.filter((item) => item.id !== workspace.id);
        setWorkspaces(remaining);

        if (workspace.id === selectedWorkspaceId) {
          setDiagrams([]);
          navigateTo(remaining[0] ? workspacePath(remaining[0].id) : "/");
        }
      },
    );
  }

  function handleCreateDiagram() {
    if (!selectedWorkspace) return;

    openNameDialog("Create diagram", "", async (name) => {
      const result = await runAction("create-diagram", () => createDiagram(selectedWorkspace.id, name));
      if (!result) return;

      setDiagrams((current) => sortByName([...current, result.diagram]));
      navigateTo(diagramPath(selectedWorkspace.id, result.diagram.id));
    });
  }

  function handleRenameDiagram(diagram: Diagram) {
    if (!selectedWorkspace) return;

    openNameDialog("Rename diagram", diagram.name, async (name) => {
      if (name === diagram.name) return;

      const result = await runAction(`rename-diagram-${diagram.id}`, () =>
        renameDiagram(selectedWorkspace.id, diagram.id, name),
      );
      if (!result) return;

      setDiagrams((current) =>
        sortByName(current.map((item) => (item.id === diagram.id ? result.diagram : item))),
      );
    });
  }

  function handleDeleteDiagram(diagram: Diagram) {
    if (!selectedWorkspace) return;

    openConfirmDialog(
      "Delete diagram",
      `Delete diagram “${diagram.name}”? This cannot be undone.`,
      async () => {
        const result = await runAction(`delete-diagram-${diagram.id}`, async () => {
          await deleteDiagram(selectedWorkspace.id, diagram.id);
          return true;
        });
        if (!result) return;

        setDiagrams((current) => current.filter((item) => item.id !== diagram.id));
      },
    );
  }

  function closeDialog() {
    setDialog(null);
  }

  function updateDialogValue(value: string) {
    setDialog((current) =>
      current?.kind === "name" ? { ...current, value, error: undefined } : current,
    );
  }

  const dialogContent = dialog?.kind === "name" ? (
    <form
      className="dialog"
      role="dialog"
      aria-labelledby="dialog-title"
      aria-modal="true"
      onSubmit={handleDialogSubmit}
    >
      <h2 id="dialog-title">{dialog.title}</h2>
      <label htmlFor="dialog-name">Name</label>
      <input
        id="dialog-name"
        type="text"
        value={dialog.value}
        onChange={(event) => updateDialogValue(event.target.value)}
        autoFocus
      />
      {dialog.error ? <p className="dialog-error">{dialog.error}</p> : null}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={closeDialog}>
          Cancel
        </button>
        <button className="primary-button" type="submit">
          Save
        </button>
      </div>
    </form>
  ) : dialog?.kind === "confirm" ? (
    <div className="dialog" role="dialog" aria-labelledby="dialog-title" aria-modal="true">
      <h2 id="dialog-title">{dialog.title}</h2>
      <p>{dialog.message}</p>
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={closeDialog}>
          Cancel
        </button>
        <button className="danger-button" type="button" onClick={handleDialogConfirm}>
          Delete
        </button>
      </div>
    </div>
  ) : null;

  const dialogOverlay = dialogContent ? (
    <div className="dialog-backdrop" role="presentation">
      {dialogContent}
    </div>
  ) : null;

  return (
    <>
      <main className="library-page">
      <header className="library-header">
        <div>
          <div className="eyebrow">Self-hosted Excalidraw</div>
          <h1>Diagrams</h1>
        </div>
        <div className="library-header-actions">
          <ThemeToggle />
          <button
            className="primary-button"
            type="button"
            disabled={actionsDisabled}
            onClick={() => void handleCreateWorkspace()}
          >
            + Workspace
          </button>
        </div>
      </header>

      {actionError ? (
        <div className="error-banner" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="library-shell" aria-label="Diagram library">
        <aside className="workspace-panel">
          <div className="panel-heading">
            <h2>Workspaces</h2>
            <span>{workspaces.length}</span>
          </div>

          {workspaceLoadState === "loading" ? (
            <div className="panel-state">Loading workspaces…</div>
          ) : null}

          {workspaceLoadState === "error" ? (
            <div className="panel-state error-state">
              <p>{workspaceLoadError}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setWorkspaceReloadKey((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          ) : null}

          {workspaceLoadState === "ready" && workspaces.length === 0 ? (
            <div className="panel-state">
              <p>No workspaces yet.</p>
              <button
                className="secondary-button"
                type="button"
                disabled={actionsDisabled}
                onClick={() => void handleCreateWorkspace()}
              >
                Create workspace
              </button>
            </div>
          ) : null}

          {workspaceLoadState === "ready" && workspaces.length > 0 ? (
            <div className="workspace-list">
              {workspaces.map((workspace) => {
                const selected = workspace.id === selectedWorkspaceId;

                return (
                  <div className={`workspace-item${selected ? " selected" : ""}`} key={workspace.id}>
                    <button
                      className="workspace-select"
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      onClick={() => navigateTo(workspacePath(workspace.id))}
                    >
                      {workspace.name}
                    </button>
                    <div className="item-actions" aria-label={`Actions for ${workspace.name}`}>
                      <button
                        type="button"
                        disabled={actionsDisabled}
                        onClick={() => void handleRenameWorkspace(workspace)}
                      >
                        Rename
                      </button>
                      <button
                        className="danger-action"
                        type="button"
                        disabled={actionsDisabled}
                        onClick={() => void handleDeleteWorkspace(workspace)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </aside>

        <section className="diagram-panel">
          {!selectedWorkspace ? (
            <div className="empty-state">
              <h2>No workspace selected</h2>
              <p>Create a workspace to start organizing diagrams.</p>
            </div>
          ) : (
            <>
              <div className="diagram-heading">
                <div>
                  <span className="section-label">Workspace</span>
                  <h2>{selectedWorkspace.name}</h2>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => void handleCreateDiagram()}
                >
                  + Diagram
                </button>
              </div>

              {diagramLoadState === "loading" ? (
                <div className="empty-state">Loading diagrams…</div>
              ) : null}

              {diagramLoadState === "error" ? (
                <div className="empty-state error-state">
                  <h3>Could not load diagrams</h3>
                  <p>{diagramLoadError}</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setDiagramReloadKey((value) => value + 1)}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {diagramLoadState === "ready" && diagrams.length === 0 ? (
                <div className="empty-state">
                  <h3>No diagrams yet</h3>
                  <p>Create the first diagram in this workspace.</p>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={actionsDisabled}
                    onClick={() => void handleCreateDiagram()}
                  >
                    Create diagram
                  </button>
                </div>
              ) : null}

              {diagramLoadState === "ready" && diagrams.length > 0 ? (
                <div className="diagram-list">
                  {diagrams.map((diagram) => (
                    <article className="diagram-item" key={diagram.id}>
                      <button
                        className="diagram-open"
                        type="button"
                        onClick={() => navigateTo(diagramPath(selectedWorkspace.id, diagram.id))}
                      >
                        <strong>{diagram.name}</strong>
                        <span>{formatUpdatedAt(diagram.updatedAt)}</span>
                      </button>
                      <div className="item-actions" aria-label={`Actions for ${diagram.name}`}>
                        <button
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => void handleRenameDiagram(diagram)}
                        >
                          Rename
                        </button>
                        <button
                          className="danger-action"
                          type="button"
                          disabled={actionsDisabled}
                          onClick={() => void handleDeleteDiagram(diagram)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      </section>
      </main>
      {dialogOverlay}
    </>
  );
}
