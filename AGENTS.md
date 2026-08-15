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
- Do not implement application authentication; Cloudflare Access is the security boundary for the MVP.

## Commits

Use `type(scope): message` and mention the relevant issue whenever possible, for example:

`feat(storage): add R2 workspace persistence for #2`

## Current implementation focus

Issue #2 adds the R2-backed workspace and diagram API. It must support create/list/rename/delete for workspaces and create/list/load/rename/save/delete for diagrams, with local Pages Functions development support.
