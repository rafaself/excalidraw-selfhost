import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = join(projectRoot, "public", "excalidraw-assets");
const sourceFonts = join(
  projectRoot,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist",
  "prod",
  "fonts",
);
const targetFonts = join(assetsRoot, "fonts");
const pdfjsAssetsRoot = join(projectRoot, "public", "pdfjs-assets");
const pdfjsPackage = join(projectRoot, "node_modules", "pdfjs-dist");

await mkdir(assetsRoot, { recursive: true });
await rm(targetFonts, { recursive: true, force: true });
await cp(sourceFonts, targetFonts, { recursive: true });

for (const assetDirectory of ["cmaps", "iccs", "standard_fonts", "wasm"]) {
  const targetDirectory = join(pdfjsAssetsRoot, assetDirectory);
  await rm(targetDirectory, { recursive: true, force: true });
  await cp(join(pdfjsPackage, assetDirectory), targetDirectory, {
    recursive: true,
  });
}

console.log("Excalidraw fonts copied to public/excalidraw-assets/fonts");
console.log("PDF.js rendering assets copied to public/pdfjs-assets");
