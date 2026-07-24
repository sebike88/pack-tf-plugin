# Migration Workflow

Follow this order. Do not skip the definition step even if you're fairly sure
it already exists — `ensure_metaobject_definition` is idempotent and cheap.

## 1. Fetch the Pack content

Use the `pack` tool to locate the target blog or article (by handle, given in
the task) and retrieve its `sections` — each section has an id, a schema/type
key, and its field data. Fetch the **published** version unless the task
explicitly says to pull a draft (draft content shouldn't leak onto a live
storefront by accident).

## 2. Group sections by type

Sections come back mixed — a hero, then two text blocks, then a quote, etc.
Group them by their Pack schema type. You'll create one Shopify metaobject
*definition* per distinct type, and one metaobject *entry* per section
instance.

## 3. Ensure a definition exists per type

For each distinct Pack section type in this article, call
`ensure_metaobject_definition` with:

- `type`: `pack_<section_type>` (e.g. a Pack "HeroBanner" section becomes
  `pack_hero_banner`) — always prefix with `pack_`, never use the bare Pack
  type name (see gotchas.md, collision risk).
- `fields`: the Pack section's own field schema (key, component, label) —
  pass it through as-is. Don't hand-guess field types; the tool maps Pack
  component types to Shopify metaobject field types itself.

## 4. Upsert one entry per section instance

For each section instance, call `upsert_metaobject_entry` with:

- `type`: the same `pack_<section_type>` as above.
- `handle`: a **stable** handle derived from the Pack section's own id, e.g.
  `pack-section-{packSectionId}`. Never generate a fresh random handle — this
  is what makes re-running the migration on an updated Pack article update
  existing entries instead of creating duplicates.
- `fields`: the section's field values, keyed the same as the field schema
  you used in step 3.

Per field type, before passing the value (see gotchas.md for the why):

- **image** — call `upload_image_from_url` first and pass the returned file
  GID, not the bare Pack CDN URL.
- **richtext/markdown** — pass the Pack value as-is. The tool converts
  markdown to HTML itself for multi_line_text fields (Shopify has no markdown
  renderer); don't pre-convert in the agent.
- **json / arrays / objects** — pass the actual array/object (the tool
  serializes it) or a valid JSON string; never a display string, and never
  into a text field.

The display name for entries is not set here — it's configured once on the
definition in step 3 (`displayNameKey`, auto-picked from a heading/title/name
field). Entries derive their display name from that field automatically.

## 5. Link the entries to the Shopify article

Once all of an article's sections have corresponding metaobject entries,
call `link_metaobjects_to_article` **once**, passing the full ordered list of
resulting metaobject GIDs in the same order the sections appeared in Pack.
This sets `article.metafields.custom.pack_content_blocks`.

## 6. Render them

See liquid-integration.md for the Liquid to add to the article template so
these blocks actually display.
