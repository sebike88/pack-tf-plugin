# Gotchas

- **Always prefix metaobject types with `pack_`.** Metaobject types are
  global to the whole shop. A bare type like `hero_banner` can collide with
  an unrelated metaobject the merchant already has for something else.

- **One metaobject definition per Pack section type — reuse it, don't
  recreate it.** Each distinct Pack section type gets exactly one metaobject
  definition (type `pack_{sectionType}`), shared across every article and
  every migration run. Before creating a definition, look up whether one
  already exists for that type and reuse it; only create when it's absent.
  Metaobject definition types are global to the shop, so blindly creating
  per-article or per-run either fails on the duplicate type or forks the
  schema. `ensure_metaobject_definition` is meant to be idempotent for
  exactly this reason — call it once per section type, keyed by the type
  handle, not once per section instance. It reconciles *additively*: on an
  existing definition it adds any fields the Pack schema has gained, but it
  never changes or removes existing fields. A field whose type changed in
  Pack, or one that was removed, won't be reconciled — flag those for a
  human, since altering a live field can drop stored entry data.

- **Give each definition a display name field.** A metaobject's display name
  (the label Shopify shows for an entry in the admin and in reference
  pickers) is set on the *definition* via `displayNameKey`, pointing at one
  field key — it is **not** a per-entry value you pass to
  `upsert_metaobject_entry`. `ensure_metaobject_definition` picks it
  automatically, preferring a `heading`, then `title`, then `name`-like field
  so entries read as e.g. "Summer Sale Hero" instead of an opaque handle. It
  only sets this when the definition doesn't already have one, so a display
  name a human chose in the admin is never overridden. If a section type has
  no heading/title/name field, entries fall back to their handle — acceptable,
  but worth noting in the plan.

- **Upsert by handle, never create-then-check.** `upsert_metaobject_entry`
  is idempotent by design — always derive the handle from the Pack section's
  own id (`pack-section-{packSectionId}`) so re-running the migration on an
  updated Pack article updates the existing entries instead of duplicating
  them.

- **Structured/array data goes in a `json` field, not text.** If a Pack field
  carries a list or object (e.g. an array of CTA items), it must map to a
  Shopify `json` field. Passing an array/object as the field value to
  `upsert_metaobject_entry` is correct — the tool JSON-stringifies it so it
  lands as valid JSON. What breaks is a `json` value stuffed into a
  `single_line_text_field`: it stringifies to something Liquid can't
  `| parse_json` reliably and can blow past text-length limits. Make sure the
  Pack component actually maps to `json` in the definition (see the field-type
  map in `server/index.js`); if Pack labels the component something the map
  doesn't know, it silently falls back to text — flag it rather than shipping
  a broken field. Shopify validates `json` fields server-side, so malformed
  JSON surfaces as a tool error, not a silent bad write.

- **Markdown is converted to HTML server-side — Shopify has no markdown
  renderer.** Pack `text` and `richtext` fields often contain markdown. Both
  Shopify text field types (`single_line_text_field` and
  `multi_line_text_field`) store exactly the string they're given and the
  Liquid snippets output it raw, so raw markdown would render as literal
  `**asterisks**` and `# hashes` on the storefront. `upsert_metaobject_entry`
  handles this itself: it looks up each field's defined type and runs a
  markdown->HTML conversion on **every text field** (values that already look
  like HTML are passed through unchanged); `url`, `number`, `boolean`, `json`
  and `file_reference` are deliberately left alone. So pass the Pack value
  as-is — do NOT pre-convert when the bundled server is doing the write, and
  don't assume a Shopify-side filter exists, because there isn't one. Render
  the result with `{{ block.<field>.value }}` (no escaping — Shopify Liquid
  doesn't auto-escape). The converter (in `server/index.js`) covers common
  markdown but is not a full CommonMark parser; if a section relies on exotic
  markdown (tables, deep nesting), verify the rendered HTML and extend the
  converter rather than assuming it round-tripped.

  **If the bundled server can't do it, the agent must.** The
  `shopify-metaobjects` server (which owns this conversion) has a known
  history of failing to connect — see the path-resolution note in
  `tools.ts`. If it's unavailable, or an `upsert_metaobject_entry` call
  errors, the conversion did NOT happen. In that case the agent is
  responsible for converting the markdown to HTML itself before the value is
  written, applying the same rules the server would: convert every text-field
  value, leave values that are already HTML untouched, and never touch
  `url`/`number`/`boolean`/`json`/`file_reference`. The goal is invariant:
  a text field must never reach the storefront as raw markdown, regardless of
  which side did the conversion.

  Wrapping note: the server's converter wraps a bare string in `<p>…</p>`.
  For a `single_line_text_field` used as a display-name source (heading /
  title / name) or output raw in Liquid, that `<p>` wrapper is usually
  unwanted — strip the outer paragraph for single-line values when converting
  by hand.

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

- **`block.fields.<key>.value` is wrong — use `block.<key>.value`.**
  `.fields.` is the GraphQL Admin API shape (what this plugin's own
  `tools.ts` server talks to), not the Liquid shape. It doesn't error, it
  just silently renders blank. See liquid-integration.md.

- **`block.type` is wrong — use `block.system.type`.** Same failure mode:
  no error, just a `case` statement that never matches anything and a block
  that silently renders nothing.

- **One Pack section type can map to more than one visual layout.** Don't
  assume a Pack schema type is homogeneous just because it has one name —
  inspect the actual fields present on each fetched instance before writing
  a snippet, and branch inside the snippet (or split into a separate
  metaobject type) if instances of the "same" type carry meaningfully
  different field sets.

- **Don't assume the reference site's CSS custom properties or JS globals
  exist in the new theme.** If a captured live-site reference relies on
  variables set by its own framework (a header-height variable set by a
  React header, for instance), those won't exist in this theme unless you
  create them. Provide a concrete numeric fallback rather than assuming the
  variable resolves to something sane — an unset CSS var used in `calc()`
  typically resolves to `0`, which silently breaks positioning rather than
  erroring.

- **In-page anchor links (e.g. a table of contents) need verified, not
  assumed, ID parity.** If anchor IDs are generated from heading text via
  `| handleize`, confirm that Liquid's handleize output actually matches
  whatever generated the reference site's real anchor IDs — different
  slugification rules (handling of apostrophes, accented characters,
  punctuation) can produce different strings from the same heading text,
  breaking every anchor link silently rather than erroring.
