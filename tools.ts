// tools.ts — config only. Theme Factory reads this object to know which MCP
// servers to connect for this plugin; nothing in this file runs in-process,
// and nothing here does actual work. All real work happens in the external
// servers themselves (Pack's hosted MCP, and the bundled server/index.js).
//
// PATH RESOLUTION — read this before assuming it "just works":
//
// A prior version of this file derived the bundled server's path from
// `import.meta.url`, guessing that this file's own runtime location survives
// the host's esbuild transpilation step unchanged. That was never verified
// against a real Theme Factory install, and is the likely reason a real run
// engaged this plugin's knowledge fine but never got a live
// `shopify-metaobjects` tool connection (Pack's `pack` server, being
// `http`-based, connected fine in that same run — consistent with local path
// resolution being the specific failure point).
//
// This version avoids import.meta.url entirely and instead uses, in order:
//
//   1. PACK_BLOG_METAOBJECTS_SERVER_PATH, if set — an explicit absolute path
//      you provide yourself. Use this for `--with-plugin` dev/testing, where
//      the plugin can live anywhere and there's no way for this file to know
//      that in advance. Set it to <path-to-this-plugin-dir>/server/index.js.
//
//   2. The documented location `tf plugin install` actually copies plugins
//      to: `~/.theme-factory/plugins/pack-blog-metaobjects/server/index.js`.
//      This is the ONLY location assumption here backed by Theme Factory's
//      own documented behavior for `tf plugin install <zip>` — not a guess
//      about internal transpilation.
//
// If you're testing via --with-plugin and haven't set the override, this
// WILL fail to spawn — set it explicitly rather than assuming the installed
// -plugin fallback path applies to your dev directory.

import os from "node:os";
import path from "node:path";

const installedPluginServerPath = path.join(
  os.homedir(),
  ".theme-factory",
  "plugins",
  "pack-blog-metaobjects",
  "server",
  "index.js",
);

const serverEntry =
  process.env.PACK_BLOG_METAOBJECTS_SERVER_PATH || installedPluginServerPath;

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

  // Bundled stdio server (server/index.js) — see the path-resolution note
  // above. Handles the write side: creating/updating Shopify metaobject
  // definitions, upserting entries, and linking them onto an article's
  // metafield.
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
