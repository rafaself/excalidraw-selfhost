import {
  Button,
  Excalidraw,
  MainMenu,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import {
  lazy,
  Suspense,
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
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  isEquationCanvasClick,
  scenePositionToViewportPosition,
  viewportPositionToScenePosition,
} from "../equations/placement";
import type {
  EquationPlacement,
  EquationScenePosition,
} from "../equations/models";
import { EQUATION_TOOL_TYPE, isEquationTool } from "../equations/tool";

const AUTOSAVE_DELAY_MS = 1500;

const LazyEquationEditor = lazy(() => import("../equations/EquationEditor"));

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

function EquationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M5 7h14M5 17h14M8 7l4 10m4-10-4 10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
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
  const [isEquationToolActive, setIsEquationToolActive] = useState(false);
  const [equationPlacement, setEquationPlacement] = useState<EquationPlacement | null>(
    null,
  );
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  const latestSceneRef = useRef<SceneSnapshot | null>(null);
  const lastPersistedSerializedRef = useRef<string | null>(null);
  const changeRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const hydratingRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const saveLoopPromiseRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);
  const equationPointerDownRef = useRef<{
    pointerId: number;
    scenePosition: EquationScenePosition;
    viewportPosition: { x: number; y: number };
  } | null>(null);
  const spaceHeldRef = useRef(false);

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
    const equationToolSelected = isEquationTool(appState.activeTool);
    setIsEquationToolActive((previous) =>
      previous === equationToolSelected ? previous : equationToolSelected,
    );

    if (!equationToolSelected) {
      equationPointerDownRef.current = null;
      if (equationPlacement) {
        setEquationPlacement(null);
      }
    } else if (equationPlacement) {
      const viewportPosition = scenePositionToViewportPosition(
        equationPlacement.scenePosition,
        appState,
      );
      setEquationPlacement((currentPlacement) => {
        if (!currentPlacement) {
          return currentPlacement;
        }

        return currentPlacement.viewportPosition.x === viewportPosition.x &&
          currentPlacement.viewportPosition.y === viewportPosition.y
          ? currentPlacement
          : { ...currentPlacement, viewportPosition };
      });
    }

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

  function closeEquationEditor(resetTool: boolean) {
    const shouldResetTool =
      resetTool &&
      excalidrawAPI !== null &&
      isEquationTool(excalidrawAPI.getAppState().activeTool);

    setEquationPlacement(null);
    setIsEquationToolActive(false);

    if (shouldResetTool) {
      excalidrawAPI.setActiveTool({ type: "selection" });
    }
  }

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
    setExcalidrawAPI(null);
    setIsEquationToolActive(false);
    setEquationPlacement(null);
    equationPointerDownRef.current = null;
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

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        equationPlacement ||
        spaceHeldRef.current ||
        event.button !== 0 ||
        !(event.target instanceof HTMLCanvasElement) ||
        !isEquationTool(excalidrawAPI.getAppState().activeTool)
      ) {
        return;
      }

      const viewportPosition = { x: event.clientX, y: event.clientY };
      const scenePosition = viewportPositionToScenePosition(
        viewportPosition,
        excalidrawAPI.getAppState(),
      );

      equationPointerDownRef.current = {
        pointerId: event.pointerId,
        scenePosition,
        viewportPosition,
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pointerDown = equationPointerDownRef.current;

      if (!pointerDown || pointerDown.pointerId !== event.pointerId) {
        return;
      }

      equationPointerDownRef.current = null;

      if (
        equationPlacement ||
        !isEquationCanvasClick(pointerDown.viewportPosition, event)
      ) {
        return;
      }

      const appState = excalidrawAPI.getAppState();
      setEquationPlacement({
        scenePosition: pointerDown.scenePosition,
        viewportPosition: scenePositionToViewportPosition(
          pointerDown.scenePosition,
          appState,
        ),
      });
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (equationPointerDownRef.current?.pointerId === event.pointerId) {
        equationPointerDownRef.current = null;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      equationPointerDownRef.current = null;
    };
  }, [excalidrawAPI, equationPlacement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spaceHeldRef.current = true;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spaceHeldRef.current = false;
      }
    };
    const handleWindowBlur = () => {
      spaceHeldRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (!excalidrawAPI || !equationPlacement) {
      return;
    }

    const updateEquationViewportPosition = () => {
      setEquationPlacement((currentPlacement) => {
        if (!currentPlacement) {
          return currentPlacement;
        }

        return {
          ...currentPlacement,
          viewportPosition: scenePositionToViewportPosition(
            currentPlacement.scenePosition,
            excalidrawAPI.getAppState(),
          ),
        };
      });
    };

    window.addEventListener("resize", updateEquationViewportPosition);
    window.addEventListener("scroll", updateEquationViewportPosition, true);

    return () => {
      window.removeEventListener("resize", updateEquationViewportPosition);
      window.removeEventListener("scroll", updateEquationViewportPosition, true);
    };
  }, [
    excalidrawAPI,
    equationPlacement?.scenePosition.x,
    equationPlacement?.scenePosition.y,
  ]);

  function handleScrollChange() {
    setEquationPlacement((currentPlacement) => {
      if (!currentPlacement || !excalidrawAPI) {
        return currentPlacement;
      }

      return {
        ...currentPlacement,
        viewportPosition: scenePositionToViewportPosition(
          currentPlacement.scenePosition,
          excalidrawAPI.getAppState(),
        ),
      };
    });
  }

  function handleEquationToolSelect() {
    if (!excalidrawAPI) {
      return;
    }

    if (equationPlacement) {
      closeEquationEditor(true);
      return;
    }

    if (isEquationTool(excalidrawAPI.getAppState().activeTool)) {
      closeEquationEditor(true);
      return;
    }

    setEquationPlacement(null);
    setIsEquationToolActive(true);
    excalidrawAPI.setActiveTool({
      type: "custom",
      customType: EQUATION_TOOL_TYPE,
    });
  }

  async function handleHome() {
    closeEquationEditor(true);
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

  async function handleEquationCommit(latex: string) {
    if (!excalidrawAPI || !equationPlacement) {
      throw new Error("The editor is not ready for equation insertion.");
    }

    const { insertEquation } = await import("../equations/insert");
    await insertEquation(excalidrawAPI, latex, equationPlacement.scenePosition);
  }

  const syncLabel =
    saveState === "saved" ? "Synced" : saveState === "saving" ? "Syncing" : "Sync";
  const canSync = saveState === "pending" || saveState === "error";

  return (
    <main className="editor-page">
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
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            onScrollChange={handleScrollChange}
            renderTopRightUI={(_isMobile, appState) => {
              const selected = isEquationTool(appState.activeTool);

              return (
                <Button
                  className="equation-tool-button"
                  disabled={!excalidrawAPI}
                  onSelect={handleEquationToolSelect}
                  selected={selected}
                  aria-label="Equation tool"
                  aria-pressed={selected}
                  title="Equation tool"
                >
                  <span aria-hidden="true">fx</span>
                </Button>
              );
            }}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: true,
              },
            }}
          >
            <MainMenu>
              <MainMenu.Group title={loaded.diagram.name}>
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
              </MainMenu.Group>
              <MainMenu.Separator />
              <MainMenu.Item
                icon={<EquationIcon />}
                disabled={!excalidrawAPI}
                selected={isEquationToolActive}
                onSelect={handleEquationToolSelect}
              >
                Equation tool
              </MainMenu.Item>
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
      {equationPlacement ? (
        <Suspense
          fallback={
            <div
              className="equation-editor equation-editor-loading"
              role="status"
              style={{
                left: `${equationPlacement.viewportPosition.x}px`,
                top: `${equationPlacement.viewportPosition.y}px`,
              }}
            >
              Loading equation editor…
            </div>
          }
        >
          <LazyEquationEditor
            viewportPosition={equationPlacement.viewportPosition}
            onCancel={() => closeEquationEditor(true)}
            onCommit={handleEquationCommit}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
