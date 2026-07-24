# pack-blog-metaobjects

Theme Factory integration plugin. Migrates blog content authored in
[Pack Digital](https://packdigital.com)'s CMS — blogs/articles built from
Pack "sections" — into native Shopify metaobject entries, attached to a
Shopify article and rendered from Liquid.

Current version: **0.1.3** — see [CHANGELOG.md](./CHANGELOG.md) for history.

## Important: how the bundled server's path is resolved

`tools.ts` spawns `server/index.js` as a local stdio MCP server. Getting
its path right matters — get it wrong and the tool silently never
connects while the plugin's knowledge still loads fine, which looks like
"nothing's wrong" right up until nothing gets written to Shopify.

`tools.ts` resolves the path in this order:

1. **`PACK_BLOG_METAOBJECTS_SERVER_PATH` env var, if set.** Required when
   testing via `--with-plugin ./pack-blog-metaobjects` — the plugin can be
   at any arbitrary path during dev testing, and there's no way for
   `tools.ts` to know that in advance. Set it to the absolute path of
   `server/index.js` inside wherever you're pointing `--with-plugin` at:
   ```bash
   export PACK_BLOG_METAOBJECTS_SERVER_PATH="$(pwd)/pack-blog-metaobjects/server/index.js"
   ```
2. **`~/.theme-factory/plugins/pack-blog-metaobjects/server/index.js`, as a
   fallback.** This is where Theme Factory's own docs say `tf plugin
   install <zip>` copies an installed plugin — so once this plugin is
   properly installed (not just `--with-plugin`'d for testing), this path
   should just work without the env var.

Deliberately **not** used: deriving the path from `tools.ts`'s own
`import.meta.url`. An earlier version did that, and it's the likely reason
a real run engaged this plugin's knowledge successfully but never got a
live `shopify-metaobjects` tool connection — that approach assumes this
file's runtime location survives the host's esbuild transpilation
unchanged, which was never actually verified. Both paths used now are
either explicitly provided by you or backed by Theme Factory's documented
install behavior — no guessing about internal transpilation.

**If you're not sure which case you're in, set the env var anyway** — it
takes priority, so it's always safe to be explicit.

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
  tools.ts                # declares the two MCP servers + path resolution
  package.json            # npm dep for the bundled server (@modelcontextprotocol/sdk)
  server/
    index.js               # bundled stdio MCP server — Shopify Admin API writes
  knowledge/
    overview.md
    workflow.md
    liquid-integration.md
    gotchas.md
  .env.example
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
not from `storeSettings`. `PACK_BLOG_METAOBJECTS_SERVER_PATH` is a
build-host/dev-environment setting, not a per-store credential — see above.

## Local development

```bash
cp .env.example .env   # fill in real values, including the server path
npm install             # installs @modelcontextprotocol/sdk for server/index.js
```

## Testing against a real Theme Factory run

```bash
export PACK_BLOG_METAOBJECTS_SERVER_PATH="$(pwd)/pack-blog-metaobjects/server/index.js"
tf run ./some-task.md --with-plugin ./pack-blog-metaobjects
```

Confirm knowledge injected AND the tool actually connected — these are
separate things and both need checking:

```
[plugins] Engaged: pack-blog-metaobjects
[plugins] Injected knowledge from: pack-blog-metaobjects
```

confirms knowledge only. To confirm `shopify-metaobjects` actually
connected, check the run transcript for a real call to one of its tools
succeeding (or a spawn/connection error naming it specifically) — knowledge
injecting successfully does not imply the tool connected.

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

Once installed via `tf plugin install`, the documented
`~/.theme-factory/plugins/pack-blog-metaobjects/` location makes the env
var override unnecessary for normal use — it's really only needed during
`--with-plugin` development.

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
  falls back to `single_line_text_field` for anything it doesn't recognize.
  An agent-assessed, explicit, validated version of this exists as a
  separate 0.2.0 line — check with the team on whether/when to fold that in.
- **A companion standalone package (`pack-blog-metaobjects-server`,
  published separately and spawned via `npx`) was scaffolded as a more
  robust long-term alternative to this bundled approach** — it removes path
  resolution from the picture entirely by matching Theme Factory's own
  documented `npx <package>` stdio pattern. Worth moving to once you're able
  to stand up a small repo/registry entry for it; the bundled approach here
  is a reasonable interim fix, not necessarily the final one.
