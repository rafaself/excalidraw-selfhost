# Excalidraw Selfhost

A small, private-first Excalidraw host designed for Cloudflare Pages, R2, Workers/Pages Functions, and Cloudflare Access.

## Current MVP status

This repository currently contains the application bootstrap from issue #1:

- React + TypeScript + Vite
- `@excalidraw/excalidraw` embedded directly as a React component
- a minimal library/editor route boundary
- self-hosted Excalidraw fonts copied from the installed package
- baseline lint, typecheck, and build scripts

R2 persistence, workspace CRUD, autosave, Terraform, and CI/CD are intentionally handled by later MVP issues.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite and select **Open demo canvas**.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Self-hosted Excalidraw assets

Excalidraw normally loads its bundled fonts from its asset host. To keep this application self-hostable, `npm install` runs `scripts/copy-excalidraw-assets.mjs`, which copies the package fonts into:

```text
public/excalidraw-assets/fonts/
```

`index.html` configures `window.EXCALIDRAW_ASSET_PATH` to `/excalidraw-assets/` before the application starts.

The copied files are generated artifacts and are not committed.

## MVP architecture

```text
Cloudflare Access
       ↓
Cloudflare Pages
       ↓
React + Excalidraw
       ↓
Pages Functions / Workers
       ↓
Cloudflare R2
```

Only the first application layer is implemented in the current bootstrap.

## License

MIT
