// tools.ts — config only. Theme Factory reads this object to know which MCP
// servers to connect for this plugin; no code here runs in-process, and
// nothing here does actual work. All real work happens in the external
// servers themselves (Pack's hosted MCP, and our bundled stdio server).

// Resolve the bundled server script relative to this file, so the plugin
// works regardless of whether it's run via --with-plugin or installed under
// ~/.theme-factory/plugins/pack-blog-metaobjects/.
const serverEntry = new URL("./server/index.js", import.meta.url).pathname;

export const mcpServers = {
  // Pack Digital's own hosted MCP server. Read-only usage here: fetching
  // blogs/articles/sections. See knowledge/workflow.md for which of its
  // tools to call and in what order.
  pack: {
    type: "http",
    url: "https://pack-agent.packdigital.workers.dev/mcp",
    headers: {
      Authorization: `Bearer ${process.env.PACK_ACCESS_TOKEN}`,
      "x-pack-store-id": process.env.PACK_STORE_ID,
      "x-pack-content-environment-id":
        process.env.PACK_CONTENT_ENVIRONMENT_ID || "production",
    },
  },

  // Our own bundled stdio server. Handles the write side: creating/updating
  // Shopify metaobject definitions, upserting entries, and linking them onto
  // an article's metafield. Spawned as a plain Node process — see server/.
  "shopify-metaobjects": {
    type: "stdio",
    command: "node",
    args: [serverEntry],
    env: {
      SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    },
  },
};

// NOTE on credentials: this plugin declares storeSettings in plugins.json
// (pack_access_token, pack_store_id, pack_content_environment_id,
// shopify_admin_access_token). Confirm with whoever manages your Theme
// Factory install that those Setting-table values are what populate the
// process.env vars referenced above for a given store — the wiring between
// storeSettings and env vars is host-managed, not something this file does.
// Never hardcode real tokens here.
