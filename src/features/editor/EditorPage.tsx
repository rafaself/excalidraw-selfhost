import {
  Excalidraw,
  MainMenu,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { navigateTo, workspacePath } from "../../app/router";
import { useTheme } from "../../app/theme";
import {
  getDiagram,
  saveDiagramDocument,
  type Diagram,
  type ExcalidrawDocument,
} from "../../services/api";

const AUTOSAVE_DELAY_MS = 1500;

type ExcalidrawOnChange = NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>;

type SceneSnapshot = {
  elements: Parameters<ExcalidrawOnChange>[0];
  appState: Parameters<ExcalidrawOnChange>[1];
  files: Parameters<ExcalidrawOnChange>[2];
};

type SerializableSceneSnapshot = {
  elements: SceneSnapshot["elements"];
  appState: Partial<SceneSnapshot["appState"]>;
  files: SceneSnapshot["files"];
};

type SaveState = "saved" | "pending" | "saving" | "error";

type LoadedDiagram = {
  diagram: Diagram;
  initialData: ReturnType<typeof restore>;
};

type EditorPageProps = {
  workspaceId: string;
  diagramId: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function serializeScene(snapshot: SerializableSceneSnapshot): string {
  // The application theme is a local preference, not diagram content.
  const appState = { ...snapshot.appState, theme: "light" as const };

  return serializeAsJSON(snapshot.elements, appState, snapshot.files, "local");
}

function parseSerializedDocument(serialized: string): ExcalidrawDocument {
  return JSON.parse(serialized) as ExcalidrawDocument;
}

function restoreDocument(document: ExcalidrawDocument): ReturnType<typeof restore> {
  return restore(document as Parameters<typeof restore>[0], null, null, {
    repairBindings: true,
  });
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      focusable="false"
    >
      <path
        d="M20 11a8 8 0 0 0-14.9-3M4 7v4h4m-4 2a8 8 0 0 0 14.9 3M20 17v-4h-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 8v5m0 3h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SyncStatusIcon({ saveState }: { saveState: SaveState }) {
  if (saveState === "saved") {
    return <CheckIcon />;
  }

  if (saveState === "error") {
    return <ErrorIcon />;
  }

  return (
    <SyncIcon
      className={saveState === "saving" ? "editor-menu-sync-icon-loading" : undefined}
    />
  );
}

export function EditorPage({ workspaceId, diagramId }: EditorPageProps) {
  const { theme, setTheme } = useTheme();
  const [loaded, setLoaded] = useState<LoadedDiagram | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const lastPersistedSerializedRef = useRef<string | null>(null);
  const changeRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const hydratingRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const saveLoopPromiseRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);

  function clearAutosaveTimer() {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function reportSaveState(nextState: SaveState, message: string | null = null) {
    if (!mountedRef.current) {
      return;
    }

    setSaveState(nextState);
    setSaveError(message);
  }

  async function drainSaveLoop(reportStatus: boolean): Promise<boolean> {
    while (true) {
      const snapshot = latestSceneRef.current;
      const revision = changeRevisionRef.current;

      if (!snapshot) {
        if (reportStatus) {
          reportSaveState("saved");
        }
        return true;
      }

      const serialized = serializeScene(snapshot);

      if (serialized === lastPersistedSerializedRef.current) {
        savedRevisionRef.current = revision;
        if (reportStatus) {
          reportSaveState("saved");
        }
        return true;
      }

      if (reportStatus) {
        reportSaveState("saving");
      }

      try {
        await saveDiagramDocument(
          workspaceId,
          diagramId,
          parseSerializedDocument(serialized),
        );
      } catch (error) {
        if (reportStatus) {
          reportSaveState("error", errorMessage(error));
        }
        return false;
      }

      lastPersistedSerializedRef.current = serialized;
      savedRevisionRef.current = revision;

      if (changeRevisionRef.current === revision) {
        if (reportStatus) {
          reportSaveState("saved");
        }
        return true;
      }
    }
  }

  function flushPendingSave(reportStatus = true): Promise<boolean> {
    clearAutosaveTimer();

    if (saveLoopPromiseRef.current) {
      return saveLoopPromiseRef.current;
    }

    const promise = drainSaveLoop(reportStatus);
    saveLoopPromiseRef.current = promise;

    void promise.finally(() => {
      if (saveLoopPromiseRef.current === promise) {
        saveLoopPromiseRef.current = null;
      }
    });

    return promise;
  }

  function scheduleAutosave() {
    clearAutosaveTimer();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void flushPendingSave();
    }, AUTOSAVE_DELAY_MS);
  }

  function hasPotentialUnsavedChanges(): boolean {
    return (
      changeRevisionRef.current !== savedRevisionRef.current ||
      saveLoopPromiseRef.current !== null
    );
  }

  const handleChange: ExcalidrawOnChange = (elements, appState, files) => {
    if (
      (appState.theme === "light" || appState.theme === "dark") &&
      appState.theme !== theme
    ) {
      setTheme(appState.theme);
    }

    const snapshot: SceneSnapshot = { elements, appState, files };
    latestSceneRef.current = snapshot;
    changeRevisionRef.current += 1;

    if (hydratingRef.current) {
      lastPersistedSerializedRef.current = serializeScene(snapshot);
      savedRevisionRef.current = changeRevisionRef.current;
      clearAutosaveTimer();
      reportSaveState("saved");
      return;
    }

    if (serializeScene(snapshot) === lastPersistedSerializedRef.current) {
      savedRevisionRef.current = changeRevisionRef.current;
      clearAutosaveTimer();
      reportSaveState("saved");
      return;
    }

    reportSaveState("pending");
    scheduleAutosave();
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      clearAutosaveTimer();
      if (hasPotentialUnsavedChanges()) {
        void flushPendingSave(false);
      }
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    clearAutosaveTimer();
    latestSceneRef.current = null;
    lastPersistedSerializedRef.current = null;
    changeRevisionRef.current = 0;
    savedRevisionRef.current = 0;
    hydratingRef.current = true;
    setLoaded(null);
    setLoadError(null);
    reportSaveState("saved");

    void getDiagram(workspaceId, diagramId, controller.signal)
      .then(({ diagram, document }) => {
        if (controller.signal.aborted) {
          return;
        }

        const restored = restoreDocument(document);
        lastPersistedSerializedRef.current = serializeScene({
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
        });
        setLoaded({ diagram, initialData: restored });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          hydratingRef.current = false;
          setLoadError(errorMessage(error));
        }
      });

    return () => controller.abort();
  }, [workspaceId, diagramId, loadAttempt]);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        hydratingRef.current = false;
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [loaded?.diagram.id]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hasPotentialUnsavedChanges()) {
        void flushPendingSave();
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPotentialUnsavedChanges()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  async function handleHome() {
    setIsLeaving(true);
    const saved = await flushPendingSave();

    if (saved) {
      navigateTo(workspacePath(workspaceId));
      return;
    }

    if (mountedRef.current) {
      setIsLeaving(false);
    }
  }

  function retryLoad() {
    setLoadAttempt((attempt) => attempt + 1);
  }

  const syncLabel =
    saveState === "saved" ? "Synced" : saveState === "saving" ? "Syncing" : "Sync";
  const canSync = saveState === "pending" || saveState === "error";

  return (
    <main className="editor-page">
      <header className="editor-toolbar">
        <div className="editor-title">
          <strong>{loaded?.diagram.name ?? "Diagram"}</strong>
          <span>{diagramId}</span>
        </div>
      </header>

      {!loaded ? (
        <section className="editor-state" role={loadError ? "alert" : "status"}>
          {loadError ? (
            <div>
              <h2>Could not load diagram</h2>
              <p>{loadError}</p>
              <button className="secondary-button" type="button" onClick={retryLoad}>
                Retry
              </button>
            </div>
          ) : (
            <p>Loading diagram…</p>
          )}
        </section>
      ) : (
        <div className="editor-canvas" aria-label="Excalidraw editor">
          <Excalidraw
            initialData={loaded.initialData}
            name={loaded.diagram.name}
            theme={theme}
            onChange={handleChange}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: true,
              },
            }}
          >
            <MainMenu>
              <MainMenu.Item
                icon={<HomeIcon />}
                disabled={isLeaving}
                onSelect={() => void handleHome()}
              >
                Home
              </MainMenu.Item>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.SaveToActiveFile />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.Group title="Excalidraw links">
                <MainMenu.DefaultItems.Socials />
              </MainMenu.Group>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.Separator />
              <MainMenu.Item
                className={`editor-menu-sync-item ${saveState}`}
                disabled={!canSync}
                icon={<SyncStatusIcon saveState={saveState} />}
                onSelect={canSync ? () => void flushPendingSave() : undefined}
                aria-label={
                  saveState === "error"
                    ? "Sync failed, retry sync"
                    : saveState === "saved"
                      ? "Synced"
                      : saveState === "saving"
                        ? "Syncing"
                        : "Sync available"
                }
                aria-live="polite"
                title={saveError ?? undefined}
              >
                {syncLabel}
              </MainMenu.Item>
            </MainMenu>
          </Excalidraw>
        </div>
      )}
    </main>
  );
}
