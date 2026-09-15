import "mathlive";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { MathfieldElement } from "mathlive";

type EquationEditorProps = {
  onCancel: () => void;
  onCommit: (latex: string) => void | Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not insert equation.";
}

export default function EquationEditor({ onCancel, onCommit }: EquationEditorProps) {
  const [latex, setLatex] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const mathfieldRef = useRef<MathfieldElement | null>(null);

  useEffect(() => {
    mathfieldRef.current?.focus();
  }, []);

  function handleInput(event: FormEvent<MathfieldElement>) {
    setLatex(event.currentTarget.value);
    setError(null);
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!latex.trim()) {
      setError("Enter an equation before inserting it.");
      mathfieldRef.current?.focus();
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      await onCommit(latex);
      onCancel();
    } catch (commitError) {
      setError(errorMessage(commitError));
      mathfieldRef.current?.focus();
    } finally {
      setIsCommitting(false);
    }
  }

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
    <div
      className="equation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isCommitting) {
          onCancel();
        }
      }}
    >
      <form
        className="equation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="equation-dialog-title"
        aria-busy={isCommitting}
        onSubmit={(event) => void handleSubmit(event)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="equation-dialog-title">Insert equation</h2>
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
          The captured LaTeX is rendered locally as a sharp SVG image.
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
            {isCommitting ? "Inserting…" : "Insert equation"}
          </button>
        </div>
      </form>
    </div>
  );
}
