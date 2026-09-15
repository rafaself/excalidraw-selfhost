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
const mathliveRoot = join(projectRoot, "public", "mathlive");
const mathlivePackage = join(projectRoot, "node_modules", "mathlive");

await mkdir(assetsRoot, { recursive: true });
await rm(targetFonts, { recursive: true, force: true });
await cp(sourceFonts, targetFonts, { recursive: true });
await rm(mathliveRoot, { recursive: true, force: true });
await mkdir(mathliveRoot, { recursive: true });
await cp(join(mathlivePackage, "fonts"), join(mathliveRoot, "fonts"), {
  recursive: true,
});
await cp(join(mathlivePackage, "sounds"), join(mathliveRoot, "sounds"), {
  recursive: true,
});

console.log("Excalidraw fonts copied to public/excalidraw-assets/fonts");
console.log("MathLive assets copied to public/mathlive");
