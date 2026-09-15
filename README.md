# Excalidraw Selfhost

A small, private-first Excalidraw host designed for Cloudflare Pages, R2, Pages Functions, and Cloudflare Access.

## MVP status

Implemented:

- React + TypeScript + Vite
- `@excalidraw/excalidraw` embedded directly as a React component
- self-hosted Excalidraw fonts copied from the installed package
- R2-backed workspace and diagram API through Cloudflare Pages Functions
- lightweight diagram metadata stored separately from full Excalidraw documents
- workspace and diagram management UI backed by the R2 API
- workspace-aware routes that preserve navigation context when opening the editor
- persisted Excalidraw document loading and debounced autosave to R2
- canvas-positioned, lazy-loaded MathLive equation authoring with local MathJax SVG insertion as ordinary Excalidraw images
- visible `Saving…`, `Saved`, and `Save failed` editor states with manual retry
- Terraform-managed Cloudflare Pages, R2, DNS, and Access infrastructure
- Cloudflare edge API rate limiting and Pages security headers
- pull request validation and automatic production deployment from `main`

The repository contains the complete MVP implementation. A first production deployment still requires the operator to apply the Terraform configuration and configure the GitHub Actions credentials described below.

## Requirements

- Node.js 20.19+ or 22.12+
- pnpm 11.8.0

CI pins Node.js 22.13.0.

## Development

Install dependencies from the committed lockfile:

```bash
pnpm install --frozen-lockfile
```

For frontend-only development:

```bash
pnpm dev
```

For the complete Pages application with Functions and a locally simulated R2 binding:

```bash
pnpm dev:pages
```

`dev:pages` builds the Vite application and starts `wrangler pages dev` with a local `DIAGRAMS` R2 binding. Wrangler persists the local R2 simulation under `.wrangler/`, which is ignored by Git.

### Local app with a remote R2 bucket

Wrangler remote bindings let the application and Pages Functions execute locally while R2 operations are proxied to a real bucket in Cloudflare. Pages requires its standard `wrangler.jsonc` configuration name when running `wrangler pages dev`, so the repository keeps the operator-owned remote settings in a separate ignored file and uses a wrapper to run Pages from an isolated temporary directory. This avoids overwriting an existing local Wrangler file and avoids the unsupported custom-config path for Pages.

Create the ignored remote configuration from the committed example:

```bash
cp wrangler.remote.jsonc.example wrangler.remote.jsonc
```

Edit only `wrangler.remote.jsonc` and set a dedicated development bucket:

```jsonc
{
  "r2_buckets": [
    {
      "binding": "DIAGRAMS",
      "bucket_name": "your-development-r2-bucket",
      "remote": true
    }
  ]
}
```

Authenticate Wrangler interactively:

```bash
pnpm exec wrangler login
```

Start the complete local application against that remote bucket:

```bash
pnpm dev:remote
```

`dev:remote` fails before building when `wrangler.remote.jsonc` is missing, still contains the placeholder bucket, omits the `DIAGRAMS` binding, or does not set `remote: true`. It validates the ignored file, builds the app, copies it to an isolated standard `wrangler.jsonc` runtime, and starts Pages with that exact validated binding. The `pnpm dev:pages` script passes its own `--r2=DIAGRAMS` binding, which takes precedence and keeps that mode on Wrangler's local R2 simulation.

Use a dedicated development R2 bucket whenever possible. A recommended operator-managed layout is:

```text
excalidraw-selfhost-diagrams      # production
excalidraw-selfhost-diagrams-dev  # remote local development
```

If you intentionally point `wrangler.remote.jsonc` at the production bucket, normal create, save, rename, and delete operations from the local application will mutate real production data. Treat that as an explicit, temporary operator choice and remove the production bucket name afterward.

No R2 access key or secret is exposed to browser code in either local mode. Pages Functions access `context.env.DIAGRAMS`; Wrangler either supplies the local simulation or proxies that binding to the configured remote bucket.

## Storage model

R2 is the only application persistence dependency for the MVP.

```text
workspaces/{workspaceId}/meta.json
workspaces/{workspaceId}/diagrams/{diagramId}/meta.json
workspaces/{workspaceId}/diagrams/{diagramId}/document.excalidraw
```

Workspace and diagram IDs are generated UUIDs. Renaming only updates metadata and never moves diagram objects.

Keeping diagram metadata separate from `document.excalidraw` allows the library to list diagrams without downloading complete scenes or embedded files.

## R2 operation profile

The storage paths are intentionally shaped around R2 operation cost and bounded Worker work:

```text
editor load       -> metadata/document reads
real autosave     -> metadata existence read + one document write
library list      -> paged R2 list + bounded metadata reads; no document downloads
workspace delete  -> paged list + batched deletes of at most 1,000 keys
```

Diagram `updatedAt` is synthesized from the newer of lightweight metadata `updatedAt` and the `uploaded` timestamp of `document.excalidraw`. Autosave therefore does not rewrite `meta.json`; a failed delete page returns an error and a retry safely converges over the remaining R2 objects.

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

Editor changes are serialized with Excalidraw's `serializeAsJSON(..., "local")` format, which keeps the editable scene data, `customData.equation` metadata, and referenced binary files while excluding transient runtime state. Autosave uses a 1.5 second debounce and only sends a `PUT` when the canonical serialized document differs from the last successful persistence. Reloading restores the same serialized document through Excalidraw's `restore()` utility, so the equation source and SVG remain part of the ordinary diagram document stored in R2.

Only one save loop can run at a time. If the scene changes during an in-flight request, the latest scene is persisted before the editor reports `Saved`. A failed request leaves the in-memory drawing untouched and exposes a `Retry` action.

Navigating back through the application flushes pending changes first. Hiding the page triggers a best-effort flush, and the browser receives an unload warning while the editor still has potentially unsaved changes.

## Equation authoring

The editor exposes an `fx` Equation tool in Excalidraw’s public top-right UI slot and a matching main-menu action. Excalidraw 0.18.1 does not expose public registration for placing custom tools in its native shape toolbar, so the stable top-right extension slot is used instead of coupling to internal DOM structure. Selecting the tool clears the previous tool’s transient state; clicking the canvas captures the click as a scene coordinate and opens a floating MathLive editor at that location.

MathLive’s canonical LaTeX value remains in React state while the Excalidraw scene stays unchanged. Panning, zooming, page scrolling, and viewport resizing recompute the overlay position from the captured scene coordinate. Clicking elsewhere on the canvas commits a non-empty equation; `Escape` or Cancel exits without creating an element; `Ctrl/Cmd + Enter` and the explicit Insert action also commit. Switching Excalidraw tools closes the transient editor and leaves the selected tool active. While the field or its controls are active, keyboard, clipboard, and undo/redo events remain scoped to MathLive; plain `Enter` is left to MathLive, while `Ctrl/Cmd + Enter` commits explicitly. Primary canvas clicks commit, while non-primary pointer gestures remain available for normal canvas interaction.

Created equations also persist `customData.equation` as the versioned `{ version: 1, latex }` source of truth. An image is editable only when that metadata passes validation; ordinary images and malformed or unsupported equation metadata remain ordinary Excalidraw images. Double-click a selected equation, or choose `Edit equation` from the main menu, to reopen its exact stored LaTeX in MathLive. Because Excalidraw 0.18.1 does not expose a public double-click prop, the editor listens to the canvas event through a stable browser capture listener and uses only public scene data and coordinate helpers.

On creation, the equation is rendered locally through MathJax’s direct SVG API using only the `base` and `ams` TeX packages, then normalized into a transparent, fixed-size SVG with an expression-local font path cache and no external assets. The current Excalidraw foreground/stroke color is applied to the SVG and retained in the image’s normal `strokeColor` property for regeneration; theme changes do not regenerate equation assets, and no separate equation color picker is introduced. On edit, the same logical element keeps its identity, scene position, rotation, image flip, and user-applied scale while receiving a new file ID, natural dimensions adjusted by the prior visual scale, and updated metadata. The SVG is added through Excalidraw’s public data-URL and element APIs and persisted through the existing `serializeAsJSON(..., "local")` autosave path. Rendering or file conversion failures leave the original element and metadata unchanged; empty existing equations remain in edit mode with validation feedback. Updates use Excalidraw’s immediate capture path so normal undo/redo restores matching metadata and rendered files.

After initialization, the editor checks only validated equation images for absent or unusable SVG files. Missing assets are regenerated from their stored LaTeX, registered with Excalidraw, and attached to the existing element in one recovery update. Healthy files are not rendered again, ordinary images are ignored, and recovery is capped at 32 equations per load with no retry loop. A failed or over-limit recovery leaves the rest of the scene usable and shows a controlled recovery message; the stored metadata remains available for a later edit attempt.

Equations remain ordinary Excalidraw image elements, so the existing PNG, SVG, Save as image, copy/duplicate, and undo/redo flows operate on the same self-contained SVG file. The normalized SVG has no external font or cache references, and exports do not require the MathLive editor to be mounted. Duplicated equations may share an immutable file until one is edited; an edit always creates a new file for that element, preserving independent source and asset state.

The first frontend build keeps the equation dependencies out of the initial application chunk; the MathLive authoring and MathJax rendering code is emitted in lazy chunk(s) and fetched on demand. In the current production build, those chunks are approximately 803 kB (220 kB gzip) for MathLive and 1.36 MB (486 kB gzip) for MathJax and insertion helpers.

Equation maintenance follows a single browser-to-document path:

```text
MathLive value
      ↓ canonical LaTeX in React state
MathJax base + ams
      ↓ normalized self-contained SVG
Excalidraw image file + { version: 1, latex } metadata
      ↓ existing local JSON autosave
R2 document.excalidraw
```

The editor never stores the live MathLive DOM or runtime app state. The versioned metadata is the only signal that an image is an editable equation; ordinary images and malformed metadata are deliberately ignored. The normalized SVG rejects embedded HTML, external URLs, and non-local asset references, so rendering is local and the saved image is self-contained. Equation edits update the image file reference and source metadata together through the existing Excalidraw scene update, while the R2 API and autosave implementation remain unchanged. MathLive's KaTeX fonts and keyboard sounds are copied into the generated `public/mathlive/` tree during install and served from same-origin `/mathlive/` paths.

MathLive (`0.110.0`) is MIT-licensed and MathJax (`@mathjax/src` `4.1.3`) is Apache-2.0-licensed. The equation test tooling is development-only: Vitest (`4.1.11`) and happy-dom (`20.14.5`) are MIT-licensed and are not included in production bundles. Dependency versions and integrity data are committed in `pnpm-lock.yaml`; no equation service, remote renderer, credential, or backend persistence dependency is introduced.

The release review also runs `pnpm audit --prod`. On the current dependency graph it reports 11 moderate/high advisories in pre-existing transitive Excalidraw dependencies (`lodash-es` through Mermaid and several `nanoid` versions); it reports no issue caused by MathLive or MathJax. Those packages are owned by the current Excalidraw release and are not overridden here: forcing incompatible major versions would be less safe than retaining the vendor-supported graph. They should be revisited before broad public exposure of the deployment, independently of the equation slice.

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

## Infrastructure

Production infrastructure lives under [`infra/`](infra/README.md) and uses the Cloudflare Terraform provider.

Terraform provisions:

```text
Cloudflare Access
       ↓
custom hostname + project.pages.dev
       ↓
Cloudflare edge rate limit + response headers
       ↓
Cloudflare Pages
       ↓
Pages Functions -- DIAGRAMS binding --> R2
```

The custom hostname is the canonical production URL. Terraform protects the production Pages hostname with a separate Access application and rate-limits the canonical `/api/*` entry point at the zone edge before Pages Functions. Pages preview and branch-alias hostnames require the one-time project-level Access policy described in [`infra/README.md`](infra/README.md).

Infrastructure changes use a manual `terraform plan` / `terraform apply` workflow. Application deployment is deliberately separate and uses a narrower Cloudflare token.

## CI/CD

Two GitHub Actions workflows keep validation and production credentials separated:

```text
pull request → pnpm install --frozen-lockfile → lint → typecheck → build
              → focused equation tests → API request-limit tests
main         → pnpm install --frozen-lockfile → lint → typecheck → build → Wrangler Pages deploy
```

`pnpm-lock.yaml` is committed and all automation uses `pnpm install --frozen-lockfile`. The project pins pnpm through the `packageManager` field in `package.json`. GitHub Actions dependencies are pinned to immutable commit SHAs, and checkout does not persist repository credentials.

Before the first production deployment, apply `infra/` and configure the `production` environment under **Settings → Environments → production**.

Production environment secrets:

- `CLOUDFLARE_API_TOKEN` — a dedicated deployment token scoped to Cloudflare Pages Edit only; do not reuse the Terraform token.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID used by Wrangler.
- `CLOUDFLARE_PAGES_PROJECT_NAME` — set this to `terraform -chdir=infra output -raw pages_project_name`.

The production workflow verifies that the configured Pages project already exists and uses `main` as its production branch before invoking Wrangler. This prevents the CI path from becoming an infrastructure-creation path accidentally.

The workflow also verifies that the existing production Pages configuration has a `DIAGRAMS` R2 binding before deployment. That check uses the Pages project API with the same Pages-only deployment token; it does not grant CI R2-management access.

Only pushes to `main` deploy. `workflow_dispatch` is available for manually retrying the production workflow and only runs the deployment job when dispatched from `main`. No GitHub workflow runs `terraform apply`.

The Pages project is Direct Upload; do not add Cloudflare Git integration as a second deployment path.

### Repository and deployment security

The `main` branch is protected with these repository rules:

- pull requests are required before merging;
- the `validate` status check must pass on the current branch tip;
- administrators are included in the rules, and force-pushes and branch deletion are disabled;
- no reviewer-count requirement is imposed because this is maintained as a single-owner deployment.

The production workflow uses the GitHub `production` environment. That environment is deployable only from protected branches, and it intentionally has no required reviewer gate so a validated merge to `main` can deploy automatically. Configure these three values as `production` environment secrets in **Settings → Environments → production**:

- `CLOUDFLARE_API_TOKEN` — a fresh Cloudflare API token with Pages Edit only;
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID;
- `CLOUDFLARE_PAGES_PROJECT_NAME` — the Terraform-created Pages project name.

GitHub cannot copy encrypted repository secrets into an environment because their values are never readable through the API. Re-enter the values in the `production` environment, verify one production deployment, then remove the corresponding repository-level secrets. Until that operator migration is completed, the workflow retains the existing secret names so deployment remains operational; the workflow never references the broader Terraform token.

Keep the Cloudflare credentials separated by purpose:

```text
Terraform bootstrap token  → local operator only; infrastructure management for Pages, R2, Access, DNS, and edge controls
GitHub production token    → production workflow only; Cloudflare Pages Edit
```

After Terraform bootstrap and any required infrastructure maintenance, revoke the broad Terraform token and create a new one only when another operator-run infrastructure change is needed. Never commit either token, Terraform state, or real `.tfvars` files.

## Quality checks

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm test:equations
pnpm test:api-limits
```

`test:equations` runs the focused Vitest suite for metadata validation, SVG asset checks, placement boundaries, scaled updates, MathJax output, and bounded recovery failures. The suite uses only equation-owned modules and mocks the Excalidraw imperative boundary where the full browser runtime cannot be loaded in Node. The running application remains the integration check for Excalidraw's public serialization and restore path: manual validation with `pnpm dev:pages` should cover structured fractions, roots, exponents, subscripts, integrals, symbols, cursor navigation, empty or invalid input, insertion failures, ordinary image insertion, duplicate/edit independence, undo/redo, PNG/SVG/Save as image exports, autosave, reload, and restored equation images. A controlled fixture with valid equation metadata and a removed referenced file should regenerate once on load and persist healthy after the next save. `pnpm build` should continue to report the equation code as lazy chunks separate from the initial application code.

The typecheck command validates frontend code and Pages Functions separately so browser and Workers runtime globals do not conflict.

`test:api-limits` starts a temporary local Pages Functions server with a local R2 simulation and verifies media type validation, malformed JSON, exact request limits, oversized requests with and without `Content-Length`, and valid Excalidraw document saves.

## Self-hosted Excalidraw assets

Excalidraw normally loads its bundled fonts from its asset host. To keep this application self-hostable, `pnpm install` runs `scripts/copy-excalidraw-assets.mjs`, which copies the package fonts into:

```text
public/excalidraw-assets/fonts/
```

`index.html` configures `window.EXCALIDRAW_ASSET_PATH` to `/excalidraw-assets/` before the application starts.

The copied files are generated artifacts and are not committed.

## License

MIT
