# Choosing Metaobject Field Types

Do not default every field to `single_line_text_field` or
`multi_line_text_field`. `ensure_metaobject_definition` requires an explicit
`type` per field, chosen by you — it validates against Shopify's real set of
metaobject field types and **rejects** anything it doesn't recognize, so a
wrong guess fails loudly instead of quietly writing a text field for
everything.

**Canonical reference — check this, don't rely on memory:**
https://shopify.dev/docs/apps/build/metafields/list-of-data-types

That page is the authoritative list of every valid field type and its exact
string name. If you encounter a field that doesn't obviously fit anything
below, open that page rather than guessing at a plausible-sounding type name.

## How to assess a field

Look at three things together, not just the Pack component name in
isolation — Pack's own component naming may not line up with Shopify's type
names, and guessing from the name alone is exactly how everything ends up as
text:

1. The Pack field's declared component/type, if the section schema provides
   one.
2. The field's key/label (e.g. `hero_image`, `cta_url`, `background_color`,
   `is_featured`).
3. A sample of the field's actual value from the fetched Pack data.

## Mapping guide

| Signal | Shopify type | Notes |
|---|---|---|
| Value is an image/video asset URL (Pack CDN, ends in `.jpg/.png/.webp/.mp4`, etc.), or key/label says image/photo/thumbnail/icon/video | `file_reference` | Call `upload_image_from_url` first; pass the returned file GID as the value, never the bare URL |
| Value is a URL used as a link/destination, and it's *not* an image asset — key/label like `link`, `url`, `cta_link`, `href` | `url` | |
| Component is richtext/HTML, or the value contains real formatting (multiple paragraphs, embedded links, lists) that matters to preserve | `rich_text_field` | Requires Shopify's specific rich-text JSON structure — see the upsert_metaobject_entry tool description. If you can't confidently build that structure, fall back to `multi_line_text_field` rather than stuffing raw HTML into a `rich_text_field` value |
| Long-form plain text without meaningful inline formatting (a paragraph, a description) | `multi_line_text_field` | |
| Short freeform text — a title, a label, a button caption | `single_line_text_field` | This should be the field that's left over after ruling out the others above, not the default you reach for first |
| Component is toggle/switch, or value is literally `true`/`false` | `boolean` | |
| Numeric value with meaningful decimals (a price, a percentage) | `number_decimal` | |
| Numeric value that's always a whole number (a count, an index) | `number_integer` | |
| Hex code or a value clearly used as a color swatch | `color` | |
| A date or date+time value | `date` / `date_time` | |

## What to do when nothing fits cleanly

If a field genuinely doesn't match anything above — a structured
object, an array, a reference to something else entirely — say so in the
plan rather than coercing it into the nearest allowed type. `json` is
available as a last resort for genuinely structured data that doesn't fit
any scalar type, but reach for it only after ruling out the more specific
types above; it loses Shopify's native validation and Liquid ergonomics for
that field.
