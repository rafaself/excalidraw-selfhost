import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const MAX_RENDERED_BYTES = 10 * 1024 * 1024;
const MAX_PAGE_RENDER_EDGE = 2200;
const MAX_PAGE_DISPLAY_EDGE = 2000;
const MAX_SOURCE_IMAGE_PIXELS = 16_000_000;
const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs-assets/`;

export type RenderedPdfPage = {
  blob: Blob;
  width: number;
  height: number;
};

export type PdfRenderProgress = (pageNumber: number, pageCount: number) => void;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error("PDF import was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function renderCanvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not render a PDF page as an image."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.88,
    );
  });
}

export async function renderPdfPages(
  file: File,
  signal: AbortSignal,
  onProgress: PdfRenderProgress,
): Promise<RenderedPdfPage[]> {
  if (file.size > MAX_PDF_FILE_BYTES) {
    throw new Error("PDF files must be 20 MB or smaller.");
  }

  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error("Choose a PDF file.");
  }

  const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes("%PDF-")) {
    throw new Error("This file does not contain a valid PDF header.");
  }

  throwIfAborted(signal);

  const data = await file.arrayBuffer();
  throwIfAborted(signal);

  const loadingTask = getDocument({
    data,
    cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
    cMapPacked: true,
    iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
    isEvalSupported: false,
    stopAtErrors: true,
    maxImageSize: MAX_SOURCE_IMAGE_PIXELS,
  });

  let destroyPromise: Promise<void> | null = null;
  const destroyLoadingTask = () => {
    destroyPromise ??= loadingTask.destroy();
    return destroyPromise;
  };
  const cancelLoadingTask = () => {
    void destroyLoadingTask();
  };

  signal.addEventListener("abort", cancelLoadingTask, { once: true });

  try {
    const pdf = await loadingTask.promise;
    throwIfAborted(signal);

    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDFs can contain up to ${MAX_PDF_PAGES} pages per import.`);
    }
    if (pdf.numPages < 1) {
      throw new Error("This PDF does not contain any pages.");
    }

    const renderedPages: RenderedPdfPage[] = [];
    let renderedBytes = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfAborted(signal);
      onProgress(pageNumber, pdf.numPages);

      const page = await pdf.getPage(pageNumber);
      const pageViewport = page.getViewport({ scale: 1 });
      const sourcePageEdge = Math.max(pageViewport.width, pageViewport.height);

      if (!Number.isFinite(sourcePageEdge) || sourcePageEdge <= 0) {
        throw new Error(`PDF page ${pageNumber} has invalid dimensions.`);
      }

      const renderScale = Math.min(2, MAX_PAGE_RENDER_EDGE / sourcePageEdge);
      const renderViewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));

      try {
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Could not prepare the PDF page renderer.");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
        }).promise;
        throwIfAborted(signal);

        const blob = await renderCanvasToJpeg(canvas);
        renderedBytes += blob.size;
        if (renderedBytes > MAX_RENDERED_BYTES) {
          throw new Error("Rendered PDF pages exceed the 10 MB import limit. Split the PDF into smaller files.");
        }

        const displayScale = Math.min(1, MAX_PAGE_DISPLAY_EDGE / sourcePageEdge);
        renderedPages.push({
          blob,
          width: pageViewport.width * displayScale,
          height: pageViewport.height * displayScale,
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }

    return renderedPages;
  } finally {
    signal.removeEventListener("abort", cancelLoadingTask);
    await destroyLoadingTask();
  }
}
