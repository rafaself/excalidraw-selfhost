# Excalidraw Selfhost

A small, private-first Excalidraw host designed for Cloudflare Pages, R2, Pages Functions, and Cloudflare Access.

## Current MVP status

Implemented:

- React + TypeScript + Vite
- `@excalidraw/excalidraw` embedded directly as a React component
- minimal library/editor route boundary
- self-hosted Excalidraw fonts copied from the installed package
- R2-backed workspace and diagram API through Cloudflare Pages Functions
- lightweight diagram metadata stored separately from full Excalidraw documents

Still intentionally deferred to later MVP issues:

- workspace/diagram management UI
- editor autosave integration
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
