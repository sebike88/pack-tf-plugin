# pack-blog-metaobjects

Theme Factory integration plugin. Migrates blog content authored in Pack
Digital's CMS (blogs/articles built from Pack "sections") into native
Shopify metaobject entries, attached to a Shopify article and rendered from
Liquid.

## What it needs

Per-store credentials (see `plugins.json` -> `storeSettings`), fetched by
Theme Factory's store-settings mechanism:

| Key | What it is |
|---|---|
| `pack_access_token` | Pack access token for the store (Secret token if you need write access to Pack itself; Public token is enough for read-only migration) |
| `pack_store_id` | Pack store ID |
| `pack_content_environment_id` | Pack content environment handle, e.g. `production` |
| `shopify_admin_access_token` | A Shopify Admin API access token (custom app) with `read_content`/`write_content` and metaobject/metafield scopes |

`SHOPIFY_STORE_DOMAIN` is expected to already be available from the task's
`# Store` section / run context.

## Try it locally before installing

```bash
tf run ./migrate-pack-article.md --with-plugin ./pack-blog-metaobjects
```

Confirm engagement in the run output (`[plugins] Engaged: pack-blog-metaobjects`)
and in `logs/<runId>.log` under `INTEGRATION PLUGINS`.

## Install permanently

```bash
cd pack-blog-metaobjects && zip -r ../pack-blog-metaobjects.zip .
tf plugin install ../pack-blog-metaobjects.zip
```

## Layout

```
pack-blog-metaobjects/
  plugins.json          # manifest
  tools.ts              # declares the two MCP servers (config only)
  package.json           # npm dep for the bundled server (@modelcontextprotocol/sdk)
  server/index.js        # bundled stdio MCP server — Shopify Admin API writes
  knowledge/
    overview.md
    workflow.md
    liquid-integration.md
    gotchas.md
```

## What it does NOT do yet

- No ongoing sync — this is a one-time migration per run, not a live sync.
- No handling for Pack content types other than blogs/articles (pages,
  product pages, collection pages) — same pattern would extend to those but
  isn't wired up here.
- Relies on Shopify's async file processing for images; very large batches
  of images may need a follow-up run if some files are still `PROCESSING`.
