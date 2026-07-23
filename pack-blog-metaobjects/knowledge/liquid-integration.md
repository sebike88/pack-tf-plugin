# Rendering pack_content_blocks in Liquid

Add this dispatch loop to the article template (typically
`sections/main-article.liquid`), wherever the migrated content blocks should
appear in the article layout:

```liquid
{%- if article.metafields.custom.pack_content_blocks != blank -%}
  <div class="pack-content-blocks">
    {%- for block in article.metafields.custom.pack_content_blocks.value -%}
      {%- case block.type -%}
        {%- when 'pack_hero_banner' -%}
          {% render 'pack-block-hero-banner', block: block %}
        {%- when 'pack_text_block' -%}
          {% render 'pack-block-text', block: block %}
        {%- when 'pack_quote' -%}
          {% render 'pack-block-quote', block: block %}
        {%- else -%}
          {%- comment -%}
            Unrecognized Pack block type: {{ block.type }}.
            Add a case + snippet for it rather than silently dropping it.
          {%- endcomment -%}
      {%- endcase -%}
    {%- endfor -%}
  </div>
{%- endif -%}
```

**Only add `when` branches for section types the migrated article actually
uses.** Don't pre-build a case for every conceivable Pack section type —
build one snippet per type as you encounter it, matching the base theme's
existing markup conventions for headings/spacing/buttons.

## Snippet pattern

Each `pack-block-*.liquid` snippet receives `block` (the metaobject) and
reads its fields directly, e.g.:

```liquid
{%- comment -%} snippets/pack-block-hero-banner.liquid {%- endcomment -%}
<div class="pack-block pack-block--hero">
  {%- if block.fields.image.value -%}
    {{ block.fields.image.value | image_url: width: 1600 | image_tag }}
  {%- endif -%}
  {%- if block.fields.heading.value -%}
    <h2>{{ block.fields.heading.value }}</h2>
  {%- endif -%}
  {%- if block.fields.subtext.value -%}
    <div>{{ block.fields.subtext.value }}</div>
  {%- endif -%}
</div>
```

Use `block.fields.<key>.value` — not `block.<key>` — since these are
metaobject field accessors, not flat properties. For a `file_reference`
field, `.value` is the referenced file/image object itself (usable directly
with `image_url`/`image_tag`), not a URL string.
