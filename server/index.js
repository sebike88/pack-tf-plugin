#!/usr/bin/env node
// Bundled MCP server (stdio transport) for pack-blog-metaobjects.
//
// Exposes a small set of tools the Dev/Analyzer agent can call to turn Pack
// Digital "sections" into Shopify metaobject definitions/entries and attach
// them to an article. Talks directly to the Shopify Admin GraphQL API.
//
// This process is spawned by Theme Factory (see ../tools.ts) and only lives
// for the duration it's connected — it does not run inside the Theme
// Factory process itself.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SHOP = process.env.SHOPIFY_STORE_DOMAIN; // e.g. my-store.myshopify.com
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = "2025-01";

if (!SHOP || !TOKEN) {
  console.error(
    "[pack-blog-metaobjects] Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN — tools will fail until these are set.",
  );
}

async function shopifyAdmin(query, variables) {
  const res = await fetch(
    `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Maps a Pack section field "component" (from its schema, e.g. 'text',
// 'richtext', 'image', 'link', 'toggle', 'number') to a Shopify metaobject
// field definition type. Unknown components fall back to single_line_text_field
// so nothing is silently dropped — the agent should flag these for review.
const PACK_TO_METAOBJECT_FIELD_TYPE = {
  text: "single_line_text_field",
  richtext: "multi_line_text_field",
  image: "file_reference",
  link: "url",
  url: "url",
  toggle: "boolean",
  boolean: "boolean",
  number: "number_decimal",
  color: "single_line_text_field",
  // Structured/repeated data (e.g. a Pack "items" array) must land in a real
  // json field, NOT single_line_text_field — a stringified array in a text
  // field can't be parsed back reliably in Liquid and trips Shopify's own
  // text-length limits. If Pack labels this component something other than
  // 'json' (e.g. 'array'/'list'), add that alias here rather than letting it
  // fall through to text.
  json: "json",
  array: "json",
  list: "json",
};

// Shopify metaobject field types that store free text and render whatever
// string they're given verbatim (no markdown renderer). Values landing in
// either of these are run through markdown->HTML on upsert, so Pack markdown
// never reaches the storefront as literal `**`/`#`. url, number, boolean,
// json and file_reference are deliberately excluded — converting them would
// corrupt the value.
const TEXT_FIELD_TYPES = new Set([
  "single_line_text_field",
  "multi_line_text_field",
]);

// Which field key should serve as a metaobject's display name (the label
// Shopify shows for an entry in the admin and in pickers). Set once on the
// DEFINITION via displayNameKey; every entry then derives its display name
// from that field automatically — it is not a per-entry value. Preference is
// descending: a heading-like field wins, else a title, else a name.
const DISPLAY_NAME_KEY_PREFERENCE = [
  "heading",
  "title",
  "name",
  "section_name",
  "sectionName",
  "label",
];
function pickDisplayNameKey(fields) {
  const keys = fields.map((f) => f.key);
  // Exact key match first (e.g. a field literally keyed "heading").
  for (const pref of DISPLAY_NAME_KEY_PREFERENCE) {
    const hit = keys.find((k) => k.toLowerCase() === pref.toLowerCase());
    if (hit) return hit;
  }
  // Then a substring match (e.g. "hero_heading", "article_title").
  for (const pref of DISPLAY_NAME_KEY_PREFERENCE) {
    const hit = keys.find((k) => k.toLowerCase().includes(pref.toLowerCase()));
    if (hit) return hit;
  }
  return undefined; // Shopify falls back to the entry handle/id.
}

// Minimal, dependency-free markdown -> HTML converter. Shopify has no
// markdown renderer and multi_line_text_field stores whatever string it's
// given, so Pack richtext (markdown) must be converted here or it renders as
// literal `**` / `#` on the storefront. This covers the common constructs
// Pack content uses (headings, emphasis, links, images, lists, code,
// blockquotes, hr, paragraphs); it is NOT a full CommonMark parser — exotic
// markdown (tables, deeply nested lists) may not round-trip perfectly.
function markdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const inline = (t) =>
    t
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>')
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1<em>$2</em>");

  const blocks = [];
  let i = 0;
  const blank = (s) => /^\s*$/.test(s);
  const isBlockStart = (s) =>
    /^```/.test(s) ||
    /^(#{1,6})\s+/.test(s) ||
    /^\s*>\s?/.test(s) ||
    /^\s*[-*+]\s+/.test(s) ||
    /^\s*\d+\.\s+/.test(s) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(s);

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }

    if (/^```/.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // consume closing fence
      blocks.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      blocks.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push("<hr>"); i++; continue; }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*[-*+]\s+/, "")));
        i++;
      }
      blocks.push(`<ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, "")));
        i++;
      }
      blocks.push(`<ol>${items.map((t) => `<li>${t}</li>`).join("")}</ol>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !blank(lines[i]) && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(`<p>${inline(para.join(" ").trim())}</p>`);
  }

  return blocks.join("\n");
}

// If a value already contains block/inline HTML, assume it's HTML and leave
// it alone — running the markdown converter over real HTML would wrap it in
// stray <p> tags. Otherwise treat it as markdown and convert.
function ensureHtml(value) {
  if (/<(p|div|h[1-6]|ul|ol|li|table|blockquote|pre|img|a|strong|em|br|span)\b/i.test(value)) {
    return value;
  }
  return markdownToHtml(value);
}

// Per-type cache of a definition's field key -> Shopify field type, so
// upsert_metaobject_entry can decide (in code, without trusting the caller)
// which values are rich text needing markdown->HTML conversion. Definitions
// are stable for the life of a migration run, so a one-time fetch per type is
// safe; the server process is short-lived (per connection).
const fieldTypeCache = new Map();
async function getFieldTypes(type) {
  if (fieldTypeCache.has(type)) return fieldTypeCache.get(type);
  const data = await shopifyAdmin(
    `query($type: String!) {
      metaobjectDefinitionByType(type: $type) {
        fieldDefinitions { key type }
      }
    }`,
    { type },
  );
  const map = {};
  const def = data.metaobjectDefinitionByType;
  if (def) {
    for (const fd of def.fieldDefinitions) map[fd.key] = fd.type;
  }
  fieldTypeCache.set(type, map);
  return map;
}

const tools = [
  {
    name: "ensure_metaobject_definition",
    description:
      "Creates a Shopify metaobject definition for a Pack section type, or if one already exists, additively adds any fields the Pack schema now has that the definition lacks (idempotent — safe to call every run). Existing fields are never modified or removed. Type should be prefixed pack_ to avoid colliding with unrelated merchant metaobjects. Fields is the Pack section's field schema: an array of {key, component, label}. This tool defines the schema only — field VALUES are written later by upsert_metaobject_entry, which converts markdown in text fields to HTML for you (Shopify has no markdown renderer) and serializes json/array values.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "e.g. pack_hero_banner" },
        name: { type: "string", description: "Human-readable definition name" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              component: { type: "string" },
              label: { type: "string" },
            },
            required: ["key", "component"],
          },
        },
      },
      required: ["type", "fields"],
    },
    handler: async ({ type, name, fields }) => {
      const fieldDefinitions = fields.map((f) => ({
        key: f.key,
        name: f.label || f.key,
        type:
          PACK_TO_METAOBJECT_FIELD_TYPE[f.component] ||
          "single_line_text_field",
      }));
      const displayNameKey = pickDisplayNameKey(fields);

      const existing = await shopifyAdmin(
        `query($type: String!) {
          metaobjectDefinitionByType(type: $type) {
            id
            displayNameKey
            fieldDefinitions { key }
          }
        }`,
        { type },
      );
      if (existing.metaobjectDefinitionByType) {
        const def = existing.metaobjectDefinitionByType;
        const existingKeys = new Set(
          def.fieldDefinitions.map((fd) => fd.key),
        );
        // Reconcile additively only: add fields the Pack schema now has that
        // the existing definition lacks. We never update or delete existing
        // fields — a type change or removal on a live definition can drop
        // stored data, so those are left for a human to decide.
        const missing = fieldDefinitions.filter(
          (fd) => !existingKeys.has(fd.key),
        );
        // Only set the display name if the definition doesn't already have one
        // — never override a display name a human may have chosen in the admin.
        const setDisplayName = displayNameKey && !def.displayNameKey;

        if (!missing.length && !setDisplayName) {
          return {
            content: [
              {
                type: "text",
                text: `Definition '${type}' already exists (${def.id}) with all ${fieldDefinitions.length} field(s) — nothing to add.`,
              },
            ],
          };
        }

        const updateDefinition = {};
        if (missing.length) {
          updateDefinition.fieldDefinitions = missing.map((fd) => ({
            create: { key: fd.key, name: fd.name, type: fd.type },
          }));
        }
        if (setDisplayName) {
          updateDefinition.displayNameKey = displayNameKey;
        }

        const updated = await shopifyAdmin(
          `mutation($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
            metaobjectDefinitionUpdate(id: $id, definition: $definition) {
              metaobjectDefinition { id type }
              userErrors { field message }
            }
          }`,
          { id: def.id, definition: updateDefinition },
        );

        const updateErrors =
          updated.metaobjectDefinitionUpdate.userErrors;
        if (updateErrors.length) {
          throw new Error(
            `metaobjectDefinitionUpdate errors: ${JSON.stringify(updateErrors)}`,
          );
        }

        const changes = [];
        if (missing.length) {
          changes.push(
            `added ${missing.length} field(s): ${missing.map((fd) => fd.key).join(", ")}`,
          );
        }
        if (setDisplayName) {
          changes.push(`set display name to '${displayNameKey}'`);
        }
        return {
          content: [
            {
              type: "text",
              text: `Definition '${type}' already existed (${def.id}) — ${changes.join("; ")}.`,
            },
          ],
        };
      }

      const definitionInput = {
        type,
        name: name || type,
        fieldDefinitions,
        access: { storefront: "PUBLIC_READ" },
        capabilities: { publishable: { enabled: true } },
      };
      if (displayNameKey) {
        definitionInput.displayNameKey = displayNameKey;
      }

      const result = await shopifyAdmin(
        `mutation($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition { id type }
            userErrors { field message }
          }
        }`,
        { definition: definitionInput },
      );

      const errors = result.metaobjectDefinitionCreate.userErrors;
      if (errors.length) {
        throw new Error(`metaobjectDefinitionCreate errors: ${JSON.stringify(errors)}`);
      }

      return {
        content: [
          {
            type: "text",
            text: `Created definition '${type}' (${result.metaobjectDefinitionCreate.metaobjectDefinition.id}).`,
          },
        ],
      };
    },
  },

  {
    name: "upsert_metaobject_entry",
    description:
      "Creates or updates a metaobject entry by handle (idempotent upsert — always use a stable handle derived from the Pack section id so re-imports update in place instead of duplicating). fields is a flat map of field key -> value. Every Shopify metaobject field stores a STRING; the tool handles conversion based on each field's defined type: arrays/objects destined for a json field are JSON-stringified for you, and all text-field values (both single_line_text and multi_line_text) are converted from markdown to HTML automatically (Shopify has no markdown renderer). Values that are already HTML are left as-is. For a file_reference field pass the GID from upload_image_from_url, not a bare URL.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        handle: { type: "string" },
        fields: { type: "object" },
      },
      required: ["type", "handle", "fields"],
    },
    handler: async ({ type, handle, fields }) => {
      const fieldTypes = await getFieldTypes(type);
      const fieldsInput = Object.entries(fields).map(([key, value]) => {
        // An array/object is meant for a json field — serialize it so it
        // lands as valid JSON rather than "[object Object]" (the exact bug
        // where a Pack array ended up as a broken string in a text field).
        if (value !== null && typeof value === "object") {
          return { key, value: JSON.stringify(value) };
        }

        let serialized = String(value);
        // Text fields: Pack sends markdown, Shopify stores it verbatim and
        // renders it verbatim, so convert to HTML here rather than trusting
        // the caller to have done it. Keyed off the field's DEFINED type, so
        // this only touches the two text field types (single_line and
        // multi_line) — never url/number/boolean/json/file_reference.
        if (TEXT_FIELD_TYPES.has(fieldTypes[key])) {
          serialized = ensureHtml(serialized);
        }
        return { key, value: serialized };
      });

      const result = await shopifyAdmin(
        `mutation($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
          metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
            metaobject { id handle type }
            userErrors { field message }
          }
        }`,
        {
          handle: { type, handle },
          metaobject: { fields: fieldsInput },
        },
      );

      const errors = result.metaobjectUpsert.userErrors;
      if (errors.length) {
        throw new Error(`metaobjectUpsert errors: ${JSON.stringify(errors)}`);
      }

      const { id } = result.metaobjectUpsert.metaobject;
      return {
        content: [{ type: "text", text: `Upserted ${type}/${handle} -> ${id}` }],
        metaobjectId: id,
      };
    },
  },

  {
    name: "upload_image_from_url",
    description:
      "Uploads an externally-hosted image (e.g. a Pack CDN asset URL) into Shopify Files and returns a file GID suitable for a file_reference metaobject field. Processing is async on Shopify's side — the returned GID is usable immediately as a reference even while it finishes processing.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        altText: { type: "string" },
      },
      required: ["url"],
    },
    handler: async ({ url, altText }) => {
      const result = await shopifyAdmin(
        `mutation($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files { id fileStatus }
            userErrors { field message }
          }
        }`,
        {
          files: [
            {
              originalSource: url,
              alt: altText || "",
              contentType: "IMAGE",
            },
          ],
        },
      );
      const errors = result.fileCreate.userErrors;
      if (errors.length) {
        throw new Error(`fileCreate errors: ${JSON.stringify(errors)}`);
      }
      const file = result.fileCreate.files[0];
      return {
        content: [{ type: "text", text: `Uploaded -> ${file.id} (${file.fileStatus})` }],
        fileId: file.id,
      };
    },
  },

  {
    name: "link_metaobjects_to_article",
    description:
      "Sets the ordered list of metaobject entries on an article's custom.pack_content_blocks metafield (list.metaobject_reference), creating the metafield definition on Article if needed. Always pass the FULL ordered list in one call — do not append incrementally across multiple calls, or ordering/duplicates break.",
    inputSchema: {
      type: "object",
      properties: {
        articleId: { type: "string", description: "Shopify Article GID" },
        metaobjectIds: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of metaobject GIDs",
        },
      },
      required: ["articleId", "metaobjectIds"],
    },
    handler: async ({ articleId, metaobjectIds }) => {
      const result = await shopifyAdmin(
        `mutation($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key namespace }
            userErrors { field message }
          }
        }`,
        {
          metafields: [
            {
              ownerId: articleId,
              namespace: "custom",
              key: "pack_content_blocks",
              type: "list.metaobject_reference",
              value: JSON.stringify(metaobjectIds),
            },
          ],
        },
      );
      const errors = result.metafieldsSet.userErrors;
      if (errors.length) {
        throw new Error(`metafieldsSet errors: ${JSON.stringify(errors)}`);
      }
      return {
        content: [
          {
            type: "text",
            text: `Linked ${metaobjectIds.length} block(s) to article ${articleId}.`,
          },
        ],
      };
    },
  },
];

const server = new Server(
  { name: "pack-blog-metaobjects", version: "0.1.3" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ handler, ...rest }) => rest),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name);
  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
  return tool.handler(request.params.arguments || {});
});

const transport = new StdioServerTransport();
await server.connect(transport);
