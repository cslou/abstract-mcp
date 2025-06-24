## 1  Overview

**Abstract** is a minimal "converter proxy" that runs as a local **Model Context Protocol (MCP)** server.
It exposes a single tool—`call_tool_and_store`—which:

1. **Calls any upstream MCP tool** on the user's behalf.
2. **Caches the full response** to local storage (`./cache/…`).
3. **Returns** to the agent a tiny, spec-compliant *resource link* (`{ "@type":"resourceLink", uri:"file://…", bytes:n }`).

By handing agents a pointer instead of a bulky payload, Abstract keeps large data sets out of the LLM context window while requiring **zero changes** to existing upstream tools or user workflows.

**Key advantage**: Abstract automatically discovers and uses MCP servers already configured in Claude Desktop—no duplicate configuration needed.

---

## 2  Problem → Solution

| Issue                                                                | Impact on LLM agents                                                       | Abstract's Answer                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Large tool responses** (JSON from search APIs, tabular data, etc.) | Blows up context length, increases latency and token cost.                 | Persist data to disk, give agent only a link.                                           |
| **Developer friction**                                               | Forcing users to re-write prompts or re-configure each tool is cumbersome. | Ship a *single* wrapper tool (`call_tool_and_store`) that lives alongside existing tools. |
| **Future storage needs**                                             | Local-only MVP could hit size limits.                                      | Local cache now; swap to Supabase/S3 by replacing one write call.                       |
| **Transparency & control**                                           | Users sometimes need raw data in context.                                  | They choose: call upstream tool directly *or* route through `call_tool_and_store`.        |

---

## 3  High-Level Architecture

```
Claude Desktop ──(stdio JSON-RPC)──►  Abstract (Node.js)
                                          │
                                          ├── Reads claude_desktop_config.json
                                          │
                                          ▼
                              Upstream MCP server (stdio)
                                          │
                                          ▼
                                   ./cache/<id>.json
```

1. Claude loads Abstract as a local MCP server.
2. Abstract reads the Claude Desktop configuration file to discover available MCP servers.
3. When the agent calls **`call_tool_and_store`**, Abstract:

   * reads the configuration for the specified upstream MCP server,
   * spawns/connects to that server via stdio,
   * forwards the tool call to that server,
   * writes the response to `./cache`,
   * sends Claude a resource link envelope.
4. Any later code-execution tool can open the file path to work with the data without polluting the chat context.

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

### 4.3  Build and compile

```bash
npm run build
```

The implementation handles:
- Loading upstream server configurations from environment variables
- Spawning independent MCP server processes via stdio
- Caching responses and returning resource links
- Proper environment variable merging for API keys

### 4.4  Add Abstract to Claude Desktop

In *Settings ▸ Developer ▸ Edit Config* (or your MCP client's config):

```jsonc
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-tavily-api-key"
      }
    },
    "gordian": {
      "command": "node",
      "args": ["/path/to/gordian/server.js"],
      "env": {
        "GORDIAN_API_KEY": "your-gordian-key"
      }
    },
    
    "abstract": {
      "command": "node",
      "args": ["/Users/you/Desktop/projects/abstract/dist/abstract.js"],
      "cwd": "/Users/you/Desktop/projects/abstract",
      "env": {
        "APP_CONFIG_PATH": "/Users/you/Library/Application Support/Claude/claude_desktop_config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,gordian"
      }
    }
  }
}
```

**Key Configuration Elements:**
- **`APP_CONFIG_PATH`**: Full path to your MCP client's config file
- **`ABSTRACT_PROXY_SERVERS`**: Comma-separated list of MCP server names to proxy
- **No duplication**: Abstract reads existing server configs from the config file
- **API keys**: Stay with their original servers (not duplicated)

**Config Path Examples:**
- **Claude Desktop (macOS)**: `/Users/you/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`  
- **Claude Desktop (Linux)**: `~/.config/Claude/claude_desktop_config.json`
- **Cursor**: `~/.cursor/config.json`
- **Cline/Windsurf**: Check your client's documentation

**How it works:**
1. Abstract reads the config file specified in `APP_CONFIG_PATH`
2. Extracts configurations for servers listed in `ABSTRACT_PROXY_SERVERS`
3. Uses those configs when spawning upstream servers

Restart your MCP client. Abstract will expose the `call_tool_and_store` tool that can call any configured upstream server.

### 4.5  Quick smoke test

1. **Prompt**:

   > "Use `call_tool_and_store` to call `tavily-mcp:search` for 'bitcoin ETF flows', then summarize the stored JSON."
2. **Observe**:

   * A new file appears in `./cache`.
   * Claude's initial reply contains only a small `resourceLink`.
   * When asked to summarize, Claude can load the file using its code tool without bloating context.

---

### 4.6  Usage Examples

**Available Tools:**
- `call_tool_and_store` - Calls upstream tools and caches responses
- `list_available_tools` - Discovers all available upstream tools

**Tool Call Format:**
```
call_tool_and_store with:
- tool_name: "tavily-mcp:search" 
- tool_args: {"query": "bitcoin ETF flows", "max_results": 10}
- description: "Bitcoin ETF search results"
```

**Supported Tool Patterns:**
- `tavily-mcp:search` - Web search via Tavily
- `gordian:get_historical_crypto_prices` - Crypto price data  
- `filesystem:read_file` - File operations
- Any MCP server configured in Claude Desktop and listed in `ABSTRACT_PROXY_SERVERS`

### 4.7  Roadmap (post-MVP)

| Feature            | Change                                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| **Remote storage** | Replace `fs.writeFile` with Supabase `storage.from().upload()`.         |
| **Path privacy**   | Serve files via `http://localhost:8383/files/:id` instead of `file://`. |
| **TTL cleanup**    | Add a cron (or on-startup sweep) to prune cache > 24 h old.             |
| **Config file**    | Load upstream servers from JSON file instead of env variable.           |
| **Streaming/SSE**  | Pipe instead of buffer for very large responses.                        |

---

**Abstract** provides a clean stdio-based architecture where users simply list which existing MCP servers to proxy, enabling seamless caching of large tool responses without context window bloat or configuration duplication.
