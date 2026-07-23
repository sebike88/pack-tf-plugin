---
plugin: pack-blog-metaobjects
---

# Pack Digital -> Shopify Metaobjects (Blog Migration)

Pack Digital is a headless CMS layered on Shopify. Its blogs and articles are
built from **Pack sections** — structured content blocks whose data model
comes from a component schema (the same concept as a Shopify theme section
schema, but on Pack's side).

This integration migrates those Pack sections into **native Shopify
metaobjects**, so the content can be attached to a Shopify Article and
rendered by this theme's own Liquid templates — independent of Pack's
Hydrogen storefront.

Use this integration when the task is about pulling a specific Pack
blog/article's content into Shopify, not about building new content from
scratch. If the task is "build a blog article page design," that's a normal
theme build — this plugin is for *importing existing Pack content* into that
design as data.

Two tool surfaces are available once this plugin is engaged:

- `pack` — Pack's own hosted MCP tools. Read-only usage: fetching
  blogs/articles/sections. Do not assume specific tool names beyond what the
  connected server actually lists — inspect its tool list at the start of the
  run rather than guessing.
- `shopify-metaobjects` (this plugin's bundled server) — write-side tools:
  `ensure_metaobject_definition`, `upsert_metaobject_entry`,
  `upload_image_from_url`, `link_metaobjects_to_article`.

See workflow.md for the order to call these in, liquid-integration.md for
the exact markup to emit, and gotchas.md for real failure modes.
