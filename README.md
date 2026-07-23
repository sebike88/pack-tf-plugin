# pack-blog-metaobjects

Theme Factory integration plugin. Migrates blog content authored in
[Pack Digital](https://packdigital.com)'s CMS — blogs/articles built from
Pack "sections" — into native Shopify metaobject entries, attached to a
Shopify article and rendered from Liquid.

Current version: **0.1.1** — see [CHANGELOG.md](./CHANGELOG.md) for history,
including two silent-failure Liquid bugs fixed after 0.1.0.

## What it does

1. Reads a Pack blog/article and its sections via Pack's own hosted MCP
   server (no custom API client needed for this side).
2. Creates a `pack_`-prefixed Shopify metaobject definition per distinct
   Pack section type.
3. Upserts one metaobject entry per section instance, keyed by a stable
   handle so re-runs update in place instead of duplicating.
4. Links the full ordered set of entries onto the target article's
   `custom.pack_content_blocks` metafield.
5. Ships the Liquid knowledge (dispatch loop + snippet pattern) needed to
   actually render those blocks in the theme.

See `knowledge/` for the full directive set injected into the
analyzer/dev/validator agents when this plugin engages, and
`knowledge/gotchas.md` in particular for failure modes that don't throw an
error — they just silently render blank.

## Layout

```
pack-blog-metaobjects/
  plugins.json           # manifest — the contract
  tools.ts                # declares the two MCP servers (config only)
  package.json            # npm dep for the bundled server (@modelcontextprotocol/sdk)
  server/
    index.js               # bundled stdio MCP server — Shopify Admin API writes
  knowledge/
    overview.md
    workflow.md
    liquid-integration.md
    gotchas.md
  .env.example             # documents required env vars for local testing
  .gitignore
  CHANGELOG.md
  README.md
```

## Required per-store credentials

Declared in `plugins.json` -> `storeSettings`, expected to be resolved by
Theme Factory's store-settings mechanism at build time:

| Key | What it is |
|---|---|
| `pack_access_token` | Pack Public token for the store (read-only — this plugin never writes to Pack) |
| `pack_store_id` | Pack store ID |
| `pack_content_environment_id` | Pack content environment handle, e.g. `production` |
| `shopify_admin_access_token` | Shopify Admin API access token (custom app) with `write_metaobject_definitions`, `write_metaobjects`, `write_content`, and `write_files` scopes |

`SHOPIFY_STORE_DOMAIN` comes from the task's `# Store` field / run context,
not from `storeSettings`.

Confirm with whoever manages your Theme Factory install exactly how
`storeSettings` values get turned into the `process.env` vars `tools.ts`
reads — that wiring is host-managed, not something this plugin controls.

## Local development

```bash
cp .env.example .env   # fill in real values for manual testing
npm install             # installs @modelcontextprotocol/sdk for server/index.js
```

Run the bundled server standalone to sanity-check it starts and connects:

```bash
node --env-file=.env server/index.js
```

## Testing against a real Theme Factory run

Point `tf run` at the plugin directory directly — no install needed:

```bash
tf run ./some-task.md --with-plugin ./pack-blog-metaobjects
```

Confirm it actually engaged and loaded (both are separate failure points —
see CHANGELOG / gotchas for the `esbuild unavailable` case, which skips
tools silently while knowledge still loads):

```
[plugins] Engaged: pack-blog-metaobjects
[plugins] Injected knowledge from: pack-blog-metaobjects
```

and check `logs/<runId>.log` under `INTEGRATION PLUGINS` for the same.

## Adding this to the `tf-plugins` repo

Per Theme Factory's plugin docs, published plugins live at
`plugins/<name>/` in the `tf-plugins` repo:

```bash
git clone <tf-plugins-repo-url>
cd tf-plugins
cp -r /path/to/pack-blog-metaobjects plugins/pack-blog-metaobjects
git checkout -b add-pack-blog-metaobjects
git add plugins/pack-blog-metaobjects
git commit -m "Add pack-blog-metaobjects plugin"
git push origin add-pack-blog-metaobjects
```

Then open a PR against `tf-plugins` in the usual way for that repo.

## Known limitations

- **One-way migration.** This copies Pack content into Shopify once; it
  does not keep the two in sync on an ongoing basis.
- **Blogs/articles only.** The same pattern would extend to other Pack
  content (pages, product pages, collection pages), but that isn't wired up
  here.
- **Image processing is async.** Very large batches of images may need a
  follow-up run if some Shopify files are still `PROCESSING` when the
  migration completes.
- **Field-type inference is still naive as of 0.1.x** — `ensure_metaobject_definition`
  maps a fixed set of Pack `component` strings to Shopify field types and
  falls back to `single_line_text_field` for anything it doesn't recognize,
  which in practice means most fields land as plain text. An
  agent-assessed, explicit, validated version of this exists as a separate
  0.2.0 line — check with the team on whether/when to fold that in before
  relying on this plugin for content with meaningful image or link fields.