import "mathlive";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { MathfieldElement } from "mathlive";
import type { EquationViewportPosition } from "./models";

type EquationEditorProps = {
  initialLatex: string;
  isExistingEquation: boolean;
  viewportPosition: EquationViewportPosition;
  onCancel: () => void;
  onCommit: (latex: string) => void | Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not insert equation.";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function EquationEditor({
  initialLatex,
  isExistingEquation,
  viewportPosition,
  onCancel,
  onCommit,
}: EquationEditorProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [error, setError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [screenPosition, setScreenPosition] = useState(viewportPosition);
  const editorRef = useRef<HTMLFormElement | null>(null);
  const mathfieldRef = useRef<MathfieldElement | null>(null);
  const isCommittingRef = useRef(false);

  useEffect(() => {
    const mathfield = mathfieldRef.current;
    setLatex(initialLatex);

    if (!mathfield) {
      return;
    }

    mathfield.value = initialLatex;
    mathfield.focus();
  }, [initialLatex]);

  useLayoutEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const reposition = () => {
      const margin = 12;
      const nextPosition = {
        x: clamp(
          viewportPosition.x,
          margin,
          window.innerWidth - editor.offsetWidth - margin,
        ),
        y: clamp(
          viewportPosition.y,
          margin,
          window.innerHeight - editor.offsetHeight - margin,
        ),
      };

      setScreenPosition((previousPosition) =>
        previousPosition.x === nextPosition.x && previousPosition.y === nextPosition.y
          ? previousPosition
          : nextPosition,
      );
    };

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(reposition);
    resizeObserver?.observe(editor);

    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      resizeObserver?.disconnect();
    };
  }, [error, viewportPosition.x, viewportPosition.y]);

  function handleInput(event: FormEvent<MathfieldElement>) {
    setLatex(event.currentTarget.value);
    setError(null);
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!latex.trim()) {
      if (isExistingEquation) {
        setError("An existing equation needs a LaTeX value.");
        mathfieldRef.current?.focus();
      } else {
        onCancel();
      }
      return;
    }

    setIsCommitting(true);
    isCommittingRef.current = true;
    setError(null);

    try {
      await onCommit(latex);
      onCancel();
    } catch (commitError) {
      setError(errorMessage(commitError));
      mathfieldRef.current?.focus();
    } finally {
      isCommittingRef.current = false;
      setIsCommitting(false);
    }
  }

  useEffect(() => {
    const handleCanvasPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        editorRef.current?.contains(event.target) ||
        !(event.target instanceof HTMLCanvasElement) ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (isCommittingRef.current) {
        return;
      }

      if (!latex.trim()) {
        if (isExistingEquation) {
          setError("An existing equation needs a LaTeX value.");
          mathfieldRef.current?.focus();
        } else {
          onCancel();
        }
        return;
      }

      void handleSubmit();
    };

    document.addEventListener("pointerdown", handleCanvasPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handleCanvasPointerDown, true);
    };
  }, [isExistingEquation, latex, onCancel]);

  function handleKeyDown(event: KeyboardEvent<MathfieldElement>) {
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      if (!isCommitting) {
        onCancel();
      }
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form
      ref={editorRef}
      className="equation-editor"
      role="dialog"
      aria-modal="false"
      aria-labelledby="equation-dialog-title"
      aria-busy={isCommitting}
      style={{ left: `${screenPosition.x}px`, top: `${screenPosition.y}px` }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onCopy={(event) => event.stopPropagation()}
      onCut={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h2 id="equation-dialog-title">
        {isExistingEquation ? "Edit equation" : "Insert equation"}
      </h2>
      <p className="equation-dialog-description">
        Type an equation with the keyboard or use MathLive’s structured input.
      </p>
      <math-field
        ref={mathfieldRef}
        className="equation-field"
        aria-label="Equation in LaTeX"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
      >
        {latex}
      </math-field>
      <p className="equation-dialog-hint">
        Click the canvas to {isExistingEquation ? "save changes" : "insert here"}, or use
        the button to commit.
      </p>
      {error ? (
        <p className="equation-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="dialog-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={isCommitting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={isCommitting}>
          {isCommitting
            ? isExistingEquation
              ? "Saving…"
              : "Inserting…"
            : isExistingEquation
              ? "Save equation"
              : "Insert equation"}
        </button>
      </div>
    </form>
  );
}
