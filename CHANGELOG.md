# Changelog

All notable changes to this plugin are documented here. Versions follow
semver as declared in `plugins.json`.

## 0.1.3

### Changed

- Reverted 0.1.2's split into a separate `pack-blog-metaobjects-server`
  package — publishing/hosting that package wasn't feasible right away.
  The server is bundled back into this plugin at `server/index.js`.
- To avoid reintroducing 0.1.2's original problem (an unverified
  `import.meta.url`-based path guess), `tools.ts` now resolves the bundled
  server's path via, in order: an explicit
  `PACK_BLOG_METAOBJECTS_SERVER_PATH` env var (required for `--with-plugin`
  dev/testing), falling back to
  `~/.theme-factory/plugins/pack-blog-metaobjects/server/index.js` — the
  location Theme Factory's own docs say `tf plugin install <zip>` actually
  uses. Neither path depends on guessing where esbuild puts the transpiled
  `tools.ts` file.
- Restored `npmDeps`/`package.json` for the bundled server's
  `@modelcontextprotocol/sdk` dependency.

### Note

- The `pack-blog-metaobjects-server` standalone package from 0.1.2 is kept
  as a scaffolded option for later — it's a more robust long-term fix (no
  path resolution at all, matches Theme Factory's documented `npx <package>`
  stdio pattern) but requires publishing it somewhere `npx` can reach,
  which wasn't practical yet.

## 0.1.2

### Changed

- **The bundled `server/index.js` approach was removed** (see 0.1.3 —
  this was reverted). `tools.ts` previously spawned the write-side tools
  via `node <path resolved from import.meta.url>` — an assumption that this
  file's runtime location survives the host's esbuild transpilation step
  unchanged. That assumption was never actually verified against a real
  Theme Factory install, and is the likely explanation for a run that
  engaged this plugin's knowledge successfully but never got a live
  connection for the `shopify-metaobjects` tools (Pack's `pack` server,
  being `http`-based, connected fine in that same run — consistent with the
  local-path resolution being the specific point of failure).
- The server logic (unchanged) moved to a separate standalone package,
  **pack-blog-metaobjects-server**, spawned via `npx <package>` — matching
  the only stdio server pattern Theme Factory's own docs actually
  demonstrate (`@shopify/dev-mcp`).

## 0.1.1

### Fixed

- `liquid-integration.md` referenced `block.fields.<key>.value` in the
  snippet pattern — this is GraphQL Admin API shape and doesn't exist in
  Liquid. Corrected to `block.<key>.value`.
- The dispatch loop's `case` statement checked `block.type`, which is not a
  valid Liquid accessor (metaobject system properties are namespaced under
  `system` to avoid colliding with user-defined fields). Corrected to
  `block.system.type`.
- Both bugs failed silently (blank render, no thrown error) rather than
  erroring, making them easy to miss without inspecting rendered output
  against known-populated metaobject entries.

### Added

- Gotchas for: keeping the `case` type string in exact sync with the type
  passed to `ensure_metaobject_definition`/`upsert_metaobject_entry`; one
  Pack section type mapping to more than one visual layout; not assuming a
  captured reference site's CSS custom properties or JS globals exist in the
  destination theme; verifying anchor-ID parity for in-page navigation
  (e.g. a table of contents) generated via `| handleize`.
- Integration guidance in `liquid-integration.md` for the common case where
  a migrated article's hero block duplicates the base theme's own
  `article.title` / featured-image rendering.

## 0.1.0

Initial release.

- `pack` (Pack Digital's hosted MCP) for read access to Pack
  blogs/articles/sections.
- Bundled `shopify-metaobjects` stdio MCP server with
  `ensure_metaobject_definition`, `upsert_metaobject_entry`,
  `upload_image_from_url`, `link_metaobjects_to_article`.
- Knowledge covering the end-to-end migration workflow, Liquid rendering
  pattern, and initial gotchas.

Known limitation carried into 0.1.1, 0.1.2, and 0.1.3:
`ensure_metaobject_definition` infers a Shopify field type from a fixed
Pack `component` -> type lookup, with an unannounced fallback to
`single_line_text_field` for anything unrecognized. In practice this meant
most fields landed as plain text regardless of their real content (images,
links, etc.). A fix for this (agent-assessed, explicit, validated field
types) was developed as 0.2.0 and is being tracked separately rather than
folded into this line — see the team before assuming 0.1.x and 0.2.x should
be reconciled into one version history.

### Changed

- **The bundled `server/index.js` approach was removed.** `tools.ts`
  previously spawned the write-side tools via `node <path resolved from
  import.meta.url>` — an assumption that this file's runtime location
  survives the host's esbuild transpilation step unchanged. That assumption
  was never actually verified against a real Theme Factory install, and is
  the likely explanation for a run that engaged this plugin's knowledge
  successfully but never got a live connection for the
  `shopify-metaobjects` tools (Pack's `pack` server, being `http`-based,
  connected fine in that same run — consistent with the local-path
  resolution being the specific point of failure).
- The server logic (unchanged) now lives in a separate standalone package,
  **pack-blog-metaobjects-server**, spawned via `npx <package>` — matching
  the only stdio server pattern Theme Factory's own docs actually
  demonstrate (`@shopify/dev-mcp`). `tools.ts` no longer contains any
  filesystem or path-resolution logic at all.
- Removed `npmDeps` from `plugins.json` and the plugin-root `package.json`
  — `@modelcontextprotocol/sdk` is now a dependency of the standalone
  server package, not of `tools.ts`, which has no dependencies of its own.

### Action required

- `tools.ts` ships with a placeholder `args` value
  (`github:your-org/pack-blog-metaobjects-server#v0.1.0`) that will fail to
  spawn until the companion package is actually pushed somewhere `npx` can
  resolve it from. See `pack-blog-metaobjects-server/README.md`.

## 0.1.1

### Fixed

- `liquid-integration.md` referenced `block.fields.<key>.value` in the
  snippet pattern — this is GraphQL Admin API shape and doesn't exist in
  Liquid. Corrected to `block.<key>.value`.
- The dispatch loop's `case` statement checked `block.type`, which is not a
  valid Liquid accessor (metaobject system properties are namespaced under
  `system` to avoid colliding with user-defined fields). Corrected to
  `block.system.type`.
- Both bugs failed silently (blank render, no thrown error) rather than
  erroring, making them easy to miss without inspecting rendered output
  against known-populated metaobject entries.

### Added

- Gotchas for: keeping the `case` type string in exact sync with the type
  passed to `ensure_metaobject_definition`/`upsert_metaobject_entry`; one
  Pack section type mapping to more than one visual layout; not assuming a
  captured reference site's CSS custom properties or JS globals exist in the
  destination theme; verifying anchor-ID parity for in-page navigation
  (e.g. a table of contents) generated via `| handleize`.
- Integration guidance in `liquid-integration.md` for the common case where
  a migrated article's hero block duplicates the base theme's own
  `article.title` / featured-image rendering.

## 0.1.0

Initial release.

- `pack` (Pack Digital's hosted MCP) for read access to Pack
  blogs/articles/sections.
- Bundled `shopify-metaobjects` stdio MCP server with
  `ensure_metaobject_definition`, `upsert_metaobject_entry`,
  `upload_image_from_url`, `link_metaobjects_to_article`.
- Knowledge covering the end-to-end migration workflow, Liquid rendering
  pattern, and initial gotchas.

Known limitation carried into 0.1.1 and 0.1.2: `ensure_metaobject_definition`
infers a Shopify field type from a fixed Pack `component` -> type lookup,
with an unannounced fallback to `single_line_text_field` for anything
unrecognized. In practice this meant most fields landed as plain text
regardless of their real content (images, links, etc.). A fix for this
(agent-assessed, explicit, validated field types) was developed as 0.2.0
and is being tracked separately rather than folded into this line — see the
team before assuming 0.1.x and 0.2.x should be reconciled into one version
history.

### Fixed

- `liquid-integration.md` referenced `block.fields.<key>.value` in the
  snippet pattern — this is GraphQL Admin API shape and doesn't exist in
  Liquid. Corrected to `block.<key>.value`.
- The dispatch loop's `case` statement checked `block.type`, which is not a
  valid Liquid accessor (metaobject system properties are namespaced under
  `system` to avoid colliding with user-defined fields). Corrected to
  `block.system.type`.
- Both bugs failed silently (blank render, no thrown error) rather than
  erroring, making them easy to miss without inspecting rendered output
  against known-populated metaobject entries.

### Added

- Gotchas for: keeping the `case` type string in exact sync with the type
  passed to `ensure_metaobject_definition`/`upsert_metaobject_entry`; one
  Pack section type mapping to more than one visual layout; not assuming a
  captured reference site's CSS custom properties or JS globals exist in the
  destination theme; verifying anchor-ID parity for in-page navigation
  (e.g. a table of contents) generated via `| handleize`.
- Integration guidance in `liquid-integration.md` for the common case where
  a migrated article's hero block duplicates the base theme's own
  `article.title` / featured-image rendering.

## 0.1.0

Initial release.

- `pack` (Pack Digital's hosted MCP) for read access to Pack
  blogs/articles/sections.
- Bundled `shopify-metaobjects` stdio MCP server with
  `ensure_metaobject_definition`, `upsert_metaobject_entry`,
  `upload_image_from_url`, `link_metaobjects_to_article`.
- Knowledge covering the end-to-end migration workflow, Liquid rendering
  pattern, and initial gotchas.

Known limitation carried into 0.1.1: `ensure_metaobject_definition` infers
a Shopify field type from a fixed Pack `component` -> type lookup, with an
unannounced fallback to `single_line_text_field` for anything unrecognized.
In practice this meant most fields landed as plain text regardless of their
real content (images, links, etc.). A fix for this (agent-assessed,
explicit, validated field types) was developed as 0.2.0 and is being
tracked separately rather than folded into this line — see the team before
assuming 0.1.x and 0.2.x should be reconciled into one version history.
