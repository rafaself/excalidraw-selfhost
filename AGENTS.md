# AGENTS.md

## Project goal

Keep this repository focused on a small, private, self-hosted Excalidraw deployment on Cloudflare. The MVP is intentionally narrow: workspaces, independent diagrams, R2 persistence, Cloudflare Access, reproducible infrastructure, and automated application deployment.

## Engineering guidance

- Prefer the smallest production-safe implementation that satisfies the active issue.
- Do not add legacy compatibility, dead code, speculative abstractions, or services that are not required.
- R2 is the only persistence dependency for the MVP; do not introduce D1, KV, Durable Objects, queues, or another database unless a future issue explicitly requires it.
- Use stable generated IDs for workspaces and diagrams. Display names must never be storage identity.
- Keep lightweight metadata separate from full Excalidraw documents so lists do not require loading complete scenes.
- Browser code must never receive R2 credentials. Persistence goes through Cloudflare Pages Functions and bindings.
- Validate request input and return small, predictable JSON errors with appropriate HTTP status codes.
- Keep Cloudflare-specific runtime code inside `functions/` and frontend code inside `src/`.
- Keep workspace and diagram identity explicit in application routes so reloads and editor navigation do not depend on transient client state.
- Prefer the existing same-origin API client under `src/services/` over direct backend calls from individual components.
- Load persisted scenes through Excalidraw's `restore()` utility and persist editor state through `serializeAsJSON(..., "local")`; do not manually store raw runtime `appState`.
- Autosave must be debounced, canonical-diffed against the last successful persistence, and single-flight so concurrent writes cannot reorder diagram state.
- Keep editor instances isolated by workspace and diagram identity; never allow pending state from one diagram to be written to another diagram ID.
- Keep Terraform production-only and intentionally applied by an operator; routine application deployment must not receive DNS, Access, or R2-management privileges.
- Keep Cloudflare Pages as a Direct Upload project. GitHub Actions owns application deployment; Terraform owns the project, bindings, DNS, Access, and R2 resources.
- Protect both the custom production hostname and the production `pages.dev` hostname with Cloudflare Access. Do not introduce application-level authentication.
- Keep local R2 simulation as the default complete development mode. Remote R2 development must use an ignored local Wrangler configuration with `remote: true`, copied from the committed example, so account- and bucket-specific settings never become repository defaults.
- Prefer a dedicated non-production R2 bucket for remote local development. Pointing the local app at the production bucket must be an explicit operator choice because normal workspace and diagram actions can write and delete remote objects.
- Keep `pnpm-lock.yaml` committed and use `pnpm install --frozen-lockfile` in automation. Do not replace deterministic CI installs with an unlocked install.
- Pin GitHub Actions dependencies to immutable commit SHAs and keep the corresponding release version in a comment for maintainability.
- Pull request validation must not reference or receive Cloudflare deployment credentials.
- Production deployment may run only from `main`, must validate the existing Pages project before deployment, and must never create infrastructure implicitly.
- Use a dedicated Cloudflare Pages deployment token for CI; never reuse the broader Terraform token.
- Never add `terraform apply` to GitHub Actions for this MVP.
- Never commit Cloudflare tokens, real `.tfvars`, Terraform state, or other credentials.

## Commits

Use `type(scope): message` and mention the relevant issue whenever possible, for example:

`feat(storage): add R2 workspace persistence for #2`
