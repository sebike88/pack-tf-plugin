# Gotchas

- **Always prefix metaobject types with `pack_`.** Metaobject types are
  global to the whole shop. A bare type like `hero_banner` can collide with
  an unrelated metaobject the merchant already has for something else.

- **Upsert by handle, never create-then-check.** `upsert_metaobject_entry`
  is idempotent by design — always derive the handle from the Pack section's
  own id (`pack-section-{packSectionId}`) so re-running the migration on an
  updated Pack article updates the existing entries instead of duplicating
  them.

- **Write the full ordered list in one `link_metaobjects_to_article` call.**
  Don't call it once per block. `list.metaobject_reference` metafields store
  order as written — multiple partial calls race and can leave the list
  incomplete or wrongly ordered.

- **New metaobject definitions need `access.storefront: PUBLIC_READ`.**
  Without it, the theme's Liquid can't read the metaobject at all, and it'll
  look like the migration silently did nothing when the definition was
  actually the problem.

- **Image fields need a real file GID, not a bare URL.** Pack's image fields
  return a CDN URL. Shopify's `file_reference` field type needs a Shopify
  File/MediaImage GID. Always call `upload_image_from_url` first for image
  fields — passing the raw URL into `upsert_metaobject_entry` will fail or
  silently store a useless string.

- **Don't guess Pack -> Shopify field type mapping yourself.** Pass the
  Pack field schema through to `ensure_metaobject_definition` as-is; the tool
  maps `component` (text/richtext/image/link/toggle/number) to the right
  Shopify field type. If you see an unfamiliar `component` value in a Pack
  schema, flag it in the plan rather than assuming — it currently falls back
  to a plain text field, which loses data for anything richer.

- **Pull published content unless told otherwise.** Fetching a draft
  Pack article by default risks migrating unpublished/unreviewed copy onto
  the live Shopify storefront.

- **This is one-way.** The migration copies data out of Pack into Shopify;
  it does not keep them in sync. If the task implies an ongoing sync rather
  than a one-time migration, say so explicitly in the plan — that's a
  materially different (and larger) piece of work than what this plugin
  currently does.
