# Excalidraw Selfhost

A small, private-first Excalidraw host designed for Cloudflare Pages, R2, Pages Functions, and Cloudflare Access.

## Current MVP status

Implemented:

- React + TypeScript + Vite
- `@excalidraw/excalidraw` embedded directly as a React component
- self-hosted Excalidraw fonts copied from the installed package
- R2-backed workspace and diagram API through Cloudflare Pages Functions
- lightweight diagram metadata stored separately from full Excalidraw documents
- workspace and diagram management UI backed by the R2 API
- workspace-aware routes that preserve navigation context when opening the editor
- persisted Excalidraw document loading and debounced autosave to R2
- visible `Saving…`, `Saved`, and `Save failed` editor states with manual retry

Still intentionally deferred to later MVP issues:

- Terraform infrastructure
- CI/CD

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Development

Install dependencies:

```bash
npm install
```

For frontend-only development:

```bash
npm run dev
```

For the complete Pages application with Functions and a locally simulated R2 binding:

```bash
npm run dev:pages
```

`dev:pages` builds the Vite application and starts `wrangler pages dev` with a local `DIAGRAMS` R2 binding. Wrangler persists the local R2 simulation under `.wrangler/`, which is ignored by Git.

No R2 access key or secret is exposed to browser code. Production only needs a Pages R2 binding named `DIAGRAMS`; the actual Cloudflare resource is provisioned by the infrastructure issue.

## Storage model

R2 is the only application persistence dependency for the MVP.

```text
workspaces/{workspaceId}/meta.json
workspaces/{workspaceId}/diagrams/{diagramId}/meta.json
workspaces/{workspaceId}/diagrams/{diagramId}/document.excalidraw
```

Workspace and diagram IDs are generated UUIDs. Renaming only updates metadata and never moves diagram objects.

Keeping diagram metadata separate from `document.excalidraw` allows the library to list diagrams without downloading complete scenes or embedded files.

## Library routes

The hash routes keep workspace identity explicit so navigation remains stable across refreshes and editor transitions:

```text
#/workspaces/{workspaceId}
#/workspaces/{workspaceId}/diagrams/{diagramId}
```

The library supports create, select, rename, and delete for workspaces, plus create, open, rename, and delete for diagrams. Destructive actions require confirmation and API failures remain visible in the UI.

Each editor route is mounted as an identity-isolated instance. This prevents pending state from one workspace/diagram pair from being reused by another editor route.

## Diagram persistence

Opening a diagram loads its R2 document and restores it through Excalidraw before rendering the editor.

Editor changes are serialized with Excalidraw's `serializeAsJSON(..., "local")` format, which keeps the editable scene data and referenced binary files while excluding transient runtime state. Autosave uses a 1.5 second debounce and only sends a `PUT` when the canonical serialized document differs from the last successful persistence.

Only one save loop can run at a time. If the scene changes during an in-flight request, the latest scene is persisted before the editor reports `Saved`. A failed request leaves the in-memory drawing untouched and exposes a `Retry` action.

Navigating back through the application flushes pending changes first. Hiding the page triggers a best-effort flush, and the browser receives an unload warning while the editor still has potentially unsaved changes.

## API

All application persistence is same-origin under `/api`:

```text
GET    /api/workspaces
POST   /api/workspaces
PATCH  /api/workspaces/:workspaceId
DELETE /api/workspaces/:workspaceId

GET    /api/workspaces/:workspaceId/diagrams
POST   /api/workspaces/:workspaceId/diagrams
GET    /api/workspaces/:workspaceId/diagrams/:diagramId
PATCH  /api/workspaces/:workspaceId/diagrams/:diagramId
PUT    /api/workspaces/:workspaceId/diagrams/:diagramId
DELETE /api/workspaces/:workspaceId/diagrams/:diagramId
```

Create and rename requests use JSON bodies with a `name` field. `PUT` accepts the Excalidraw document itself as JSON. Invalid inputs return compact JSON errors and stored responses are marked `no-store`.

`public/_routes.json` restricts Pages Functions invocation to `/api/*`, leaving static application requests on the Pages static path.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

The typecheck command validates frontend code and Pages Functions separately so browser and Workers runtime globals do not conflict.

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
Pages Functions
       ↓
Cloudflare R2
```

## License

MIT
