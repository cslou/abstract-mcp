## 1  Overview

**Abstract** is a minimal “converter proxy” that runs as a local **Model Context Protocol (MCP)** server.
It exposes a single tool—`convert_and_store`—which:

1. **Calls any upstream MCP tool** on the user’s behalf.
2. **Caches the full response** to local storage (`./cache/…`).
3. **Returns** to the agent a tiny, spec-compliant *resource link* (`{ "@type":"resourceLink", uri:"file://…", bytes:n }`).

By handing agents a pointer instead of a bulky payload, Abstract keeps large data sets out of the LLM context window while requiring **zero changes** to existing upstream tools or user workflows.

---

## 2  Problem → Solution

| Issue                                                                | Impact on LLM agents                                                       | Abstract’s Answer                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Large tool responses** (JSON from search APIs, tabular data, etc.) | Blows up context length, increases latency and token cost.                 | Persist data to disk, give agent only a link.                                           |
| **Developer friction**                                               | Forcing users to re-write prompts or re-configure each tool is cumbersome. | Ship a *single* wrapper tool (`convert_and_store`) that lives alongside existing tools. |
| **Future storage needs**                                             | Local-only MVP could hit size limits.                                      | Local cache now; swap to Supabase/S3 by replacing one write call.                       |
| **Transparency & control**                                           | Users sometimes need raw data in context.                                  | They choose: call upstream tool directly *or* route through `convert_and_store`.        |

---

## 3  High-Level Architecture

```
Claude Desktop ──(stdio JSON-RPC)──►  Abstract (Node.js)
                                          │
                                          ▼
                              Upstream MCP server (HTTP/SSE)
                                          │
                                          ▼
                                   ./cache/<id>.json
```

1. Claude loads Abstract as a local MCP server.
2. When the agent calls **`convert_and_store`**, Abstract:

   * forwards the inner request to the remote MCP,
   * writes the response to `./cache`,
   * sends Claude a resource link envelope.
3. Any later code-execution tool can open the file path to work with the data without polluting the chat context.

---

## 4  Step-by-Step Implementation Guide

### 4.1  Prerequisites

| Item                  | Min. version                        |
| --------------------- | ----------------------------------- |
| Node.js               | 18 LTS                              |
| TypeScript (optional) | 5.x                                 |
| Claude Desktop        | 0.13+ (MCP enabled)                 |
| NPM packages          | `@modelcontextprotocol/sdk`, `uuid` |

### 4.2  Project bootstrap

```bash
mkdir abstract && cd abstract
npm init -y
npm install @modelcontextprotocol/sdk uuid
```

### 4.3  `abstract.ts` – \~90 LoC core

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpClient } from "@modelcontextprotocol/sdk/client/http.js";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";

/* === basic config === */
const CACHE_DIR   = path.resolve("./cache");
const DEFAULT_MCP = "https://api.tavily.com/mcp";      // override per call
await fs.mkdir(CACHE_DIR, { recursive: true });

/* === start MCP server over stdio === */
const server = new McpServer({ name: "abstract", version: "0.1.0" });

/* ---- 1.  convert_and_store tool --------------------------------------- */
server.addTool({
  name: "convert_and_store",
  description: "Call any MCP tool, cache full result, return a resourceLink.",
  inputSchema: {
    type: "object",
    properties: {
      server: { type: "string", description: "Upstream MCP base URL" },
      tool:   { type: "string", description: "Tool name on upstream MCP" },
      args:   { type: "object", description: "Arguments for that tool" }
    },
    required: ["tool"]
  },
  run: async ({ server: remote = DEFAULT_MCP, tool, args = {} }) => {
    const upstream = new McpClient({ baseUrl: remote });
    const data     = await upstream.callTool(tool, args);

    const id   = uuid() + ".json";
    const file = path.join(CACHE_DIR, id);
    await fs.writeFile(file, JSON.stringify(data, null, 2));

    return {
      "@type": "resourceLink",
      uri:    `file://${file}`,
      bytes:  Buffer.byteLength(JSON.stringify(data))
    };
  }
});

/* ---- 2.  pass-through manifest so upstream tools stay visible ---------- */
server.setManifestResolver(async () => {
  const upstream = new McpClient({ baseUrl: DEFAULT_MCP });
  const m        = await upstream.getManifest();
  return {
    ...m,
    tools: [
      { name: "convert_and_store", description: "Proxy + cache converter" },
      ...m.tools
    ]
  };
});

/* ---- 3.  pass-through direct calls (optional convenience) ------------- */
server.setCallToolHook(async ({ tool, args }) => {
  const upstream = new McpClient({ baseUrl: DEFAULT_MCP });
  return upstream.callTool(tool, args);
});

/* ---- 4.  listen ------------------------------------------------------- */
server.listen(new StdioServerTransport());
```

Compile and run:

```bash
npx tsc abstract.ts --target es2022 --module commonjs --outDir .
node abstract.js   # Claude will normally launch this itself
```

### 4.4  Add Abstract to Claude Desktop

In *Settings ▸ Developer ▸ Edit Config*:

```jsonc
{
  "mcpServers": {
    "abstract": {
      "command": "node",
      "args": ["./abstract.js"]
    }
  }
}
```

Restart Claude.  It auto-discovers:

* `convert_and_store`
* every tool advertised by the upstream MCP (e.g., `tavily.search`)

### 4.5  Quick smoke test

1. **Prompt**:

   > “Use `convert_and_store` to call `tavily.search` for ‘bitcoin ETF flows’, then summarize the stored JSON.”
2. **Observe**:

   * A new file appears in `./cache`.
   * Claude’s initial reply contains only a small `resourceLink`.
   * When asked to summarize, Claude can load the file using its code tool without bloating context.

---

### 4.6  Roadmap (post-MVP)

| Feature            | Change                                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| **Remote storage** | Replace `fs.writeFile` with Supabase `storage.from().upload()`.         |
| **Path privacy**   | Serve files via `http://localhost:8383/files/:id` instead of `file://`. |
| **TTL cleanup**    | Add a cron (or on-startup sweep) to prune cache > 24 h old.             |
| **Multiple MCPs**  | Accept an array of upstream servers; merge all manifests.               |
| **Streaming/SSE**  | Pipe instead of buffer for very large responses.                        |

---

With \~100 lines of code and a single Claude configuration entry, **Abstract** proves that file-level mediation is trivial to add, transparent to users, and immediately alleviates LLM context-length pain.
