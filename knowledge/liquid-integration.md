# Rendering pack_content_blocks in Liquid

Add this dispatch loop to the article template (typically
`sections/main-article.liquid`), wherever the migrated content blocks should
appear in the article layout:

```liquid
{%- if article.metafields.custom.pack_content_blocks != blank -%}
  <div class="pack-content-blocks">
    {%- for block in article.metafields.custom.pack_content_blocks.value -%}
      {%- case block.system.type -%}
        {%- when 'pack_hero_banner' -%}
          {% render 'pack-block-hero-banner', block: block %}
        {%- when 'pack_text_block' -%}
          {% render 'pack-block-text', block: block %}
        {%- when 'pack_quote' -%}
          {% render 'pack-block-quote', block: block %}
        {%- else -%}
          {%- comment -%}
            Unrecognized Pack block type: {{ block.system.type }}.
            Add a case + snippet for it rather than silently dropping it.
          {%- endcomment -%}
      {%- endcase -%}
    {%- endfor -%}
  </div>
{%- endif -%}
```

**Use `block.system.type`, not `block.type`.** Shopify groups metaobject
system properties (type, id, handle, etc.) under `system` specifically so
they can't collide with a user-defined field that happens to be named
`type`. `block.type` is not a valid accessor and will not error — it will
just silently evaluate to blank, so every `case` branch falls through to
`else` and nothing renders. See
https://shopify.dev/docs/api/liquid/objects/metaobject for the full system
object reference.

**The `case` value must exactly match the `type` string you passed to
`ensure_metaobject_definition`/`upsert_metaobject_entry` — not a
reconstruction of it.** If you created the definition as `pack_heroBanner`
(camelCase preserved from a Pack type key) but write `pack_hero_banner` in
the `case` branch, the branch will never match. Copy the exact type string
you used when calling the tools, don't re-derive it from memory or from
Pack's original naming convention.

**Only add `when` branches for section types the migrated article actually
uses.** Don't pre-build a case for every conceivable Pack section type —
build one snippet per type as you encounter it, matching the base theme's
existing markup conventions for headings/spacing/buttons.

## Snippet pattern

Each `pack-block-*.liquid` snippet receives `block` (the metaobject) and
reads its fields **directly on the block itself** — not nested under a
`fields` property:

```liquid
{%- comment -%} snippets/pack-block-hero-banner.liquid {%- endcomment -%}
<div class="pack-block pack-block--hero">
  {%- if block.image.value -%}
    {{ block.image.value | image_url: width: 1600 | image_tag }}
  {%- endif -%}
  {%- if block.heading.value -%}
    <h2>{{ block.heading.value }}</h2>
  {%- endif -%}
  {%- if block.subtext.value -%}
    <div>{{ block.subtext.value }}</div>
  {%- endif -%}
</div>
```

**Use `block.<field_key>.value` — never `block.fields.<field_key>.value`.**
`.fields.` is GraphQL Admin API shape (used inside this plugin's own
`tools.ts` server, which talks to the Admin API directly) — it does not
exist in Liquid's metaobject object. Writing `block.fields.x.value` in a
snippet doesn't error, it just silently evaluates to blank, so the block
renders as an empty shell with no visible failure. If a snippet renders
nothing and the underlying metaobject entry demonstrably has data (check in
the Shopify admin), a stray `.fields.` access is the first thing to check.

For a `file_reference` field, `.value` is the referenced file/image object
itself (usable directly with `image_url`/`image_tag`), not a URL string.

## Integrating with the base theme's own article rendering

`main-article.liquid` (or the base theme's equivalent) already renders
`article.title` as an H1 and the Shopify featured image, independent of
this migration. If a migrated article's hero block also renders a title and
image — which is typical, since Pack's own hero section usually carries
both — you'll get visible duplication once `pack_content_blocks` renders
alongside it.

Before wiring in the dispatch loop, check for this specific article whether
`article.content` and the featured image are actually blank (a fully
migrated article may have nothing else in the native fields). If they're
blank, no conflict exists. If they're populated, either suppress the
redundant title/image in the base template for migrated articles (e.g. a
conditional keyed off the presence of `pack_content_blocks`) or accept the
duplication as a known limitation for now — don't silently pick one without
surfacing it, since either choice affects how future non-Pack articles
render too.
