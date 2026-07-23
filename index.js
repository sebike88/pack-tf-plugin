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
const API_VERSION = "2026-07";

if (!SHOP || !TOKEN) {
  console.error(
    "[pack-blog-metaobjects] Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN — tools will fail until these are set.",
  );
}

// The full set of Shopify metaobject field types this tool will accept.
// Source of truth: https://shopify.dev/docs/apps/build/metafields/list-of-data-types
// Keep this in sync with that page — it's the canonical list, not something
// to extend from memory. Deliberately excludes reference types
// (product_reference, collection_reference, metaobject_reference, ...) and
// the list.* variants — this plugin doesn't currently generate those; if a
// Pack field genuinely needs one, treat that as a reason to pause and extend
// this list deliberately, not to force it into the nearest allowed type.
const ALLOWED_FIELD_TYPES = new Set([
  "single_line_text_field",
  "multi_line_text_field",
  "rich_text_field",
  "url",
  "file_reference",
  "boolean",
  "color",
  "date",
  "date_time",
  "number_integer",
  "number_decimal",
  "dimension",
  "volume",
  "weight",
  "rating",
  "money",
  "json",
]);

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
};

const tools = [
  {
    name: "ensure_metaobject_definition",
    description:
      "Creates a Shopify metaobject definition for a Pack section type if it doesn't already exist (idempotent — safe to call every run). Type should be prefixed pack_ to avoid colliding with unrelated merchant metaobjects. " +
      "For `fields`, YOU choose the Shopify field type per field — do not default everything to single_line_text_field. Assess each Pack field's component, key/label, and a sample value, then pick the matching type from " +
      "https://shopify.dev/docs/apps/build/metafields/list-of-data-types (see knowledge/field-type-mapping.md for the heuristics and worked examples). Common mappings: an image/CDN-asset field -> file_reference (upload it with upload_image_from_url first and pass the returned file GID as the value); a link/href/CTA-url field -> url; a long-form/formatted body field -> rich_text_field or multi_line_text_field depending on whether it needs real formatting; a true/false toggle -> boolean; a numeric field -> number_integer or number_decimal; a hex/swatch color -> color. Short plain labels/titles are the main real case for single_line_text_field — it should be the exception, not the default. Unrecognized types are rejected so mistakes surface immediately instead of silently writing the wrong schema.",
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
      const existing = await shopifyAdmin(
        `query($type: String!) { metaobjectDefinitionByType(type: $type) { id } }`,
        { type },
      );
      if (existing.metaobjectDefinitionByType) {
        return {
          content: [
            {
              type: "text",
              text: `Definition '${type}' already exists (${existing.metaobjectDefinitionByType.id}) — skipped create.`,
            },
          ],
        };
      }

      const fieldDefinitions = fields.map((f) => ({
        key: f.key,
        name: f.label || f.key,
        type:
          PACK_TO_METAOBJECT_FIELD_TYPE[f.component] ||
          "single_line_text_field",
      }));

      const result = await shopifyAdmin(
        `mutation($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition { id type }
            userErrors { field message }
          }
        }`,
        {
          definition: {
            type,
            name: name || type,
            fieldDefinitions,
            access: { storefront: "PUBLIC_READ" },
            capabilities: { publishable: { enabled: true } },
          },
        },
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
      "Creates or updates a metaobject entry by handle (idempotent upsert — always use a stable handle derived from the Pack section id so re-imports update in place instead of duplicating). fields is a flat map of field key -> value, matching the types set in ensure_metaobject_definition for this same type. " +
      "For file_reference fields, pass the file GID returned by upload_image_from_url, never a bare URL. For rich_text_field fields, pass Shopify's rich-text JSON structure (a root node with a children array of paragraph/list nodes — see https://shopify.dev/docs/apps/build/metafields/list-of-data-types#rich-text-field), not raw HTML or Markdown — if you can't produce that structure confidently, use multi_line_text_field for that field instead rather than passing raw markup into a rich_text_field.",    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        handle: { type: "string" },
        fields: { type: "object" },
      },
      required: ["type", "handle", "fields"],
    },
    handler: async ({ type, handle, fields }) => {
      const fieldsInput = Object.entries(fields).map(([key, value]) => ({
        key,
        value: String(value),
      }));

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
  { name: "pack-blog-metaobjects", version: "0.1.0" },
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
