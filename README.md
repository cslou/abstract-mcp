# Abstract MCP Server

A minimal "converter proxy" MCP server that caches large tool responses to local storage and returns compact resource links instead of bulky payloads.

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your MCP client config (Claude Desktop, Cursor, Cline, etc.):

```json
{
  "mcpServers": {
    // Your existing MCP servers (no changes needed!)
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
    
    // Add Abstract - it will use the servers above
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

### Config Path Examples

Set `APP_CONFIG_PATH` to your MCP client's config file:

- **Claude Desktop (macOS)**: `/Users/you/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Desktop (Linux)**: `~/.config/Claude/claude_desktop_config.json`
- **Cursor**: `~/.cursor/config.json`
- **Other clients**: Check your client's documentation for config location

Abstract reads this config file to find the settings for servers listed in `ABSTRACT_PROXY_SERVERS`.

## Usage

Abstract provides two tools:

- `call_tool_and_store` - Calls upstream tools and caches responses
- `list_available_tools` - Lists all available upstream tools

Example usage:
```
call_tool_and_store with:
- tool_name: "tavily-mcp:search"
- tool_args: {"query": "bitcoin ETF flows", "max_results": 10}
- description: "Bitcoin ETF search results"
```

The tool returns a compact resource link instead of the full response, keeping your context window clean.

## Development

- `npm run build` - Compile TypeScript
- `npm run dev` - Build and start server
- `npm start` - Start the compiled server

## Architecture

```
MCP Client (Claude/Cursor/etc) ──(stdio JSON-RPC)──► Abstract (Node.js)
                                                          │
                                                          ├── Reads client config file
                                                          │
                                                          ▼
                                              Upstream MCP servers (stdio)
                                                          │
                                                          ▼
                                                 ./cache/<uuid>.json
```

**How it works:**
1. Abstract reads your MCP client's config file (specified via `APP_CONFIG_PATH`)
2. Extracts configurations for servers listed in `ABSTRACT_PROXY_SERVERS`
3. When tools are called, Abstract spawns the upstream servers using their original configs
4. Tool responses are cached locally and resource links returned to the client
5. Large datasets stay out of the conversation context

**Key features:**
- **Client-agnostic**: Works with Claude Desktop, Cursor, Cline, Windsurf, or any MCP client
- **Zero duplication**: Reuses existing server configurations from your client's config
- **Transparent**: API keys and environment variables are properly forwarded
- **Flexible**: Supports any MCP server that can be spawned via stdio

**Supported upstream servers:**
- Any MCP server that can be spawned via stdio
- Examples: `tavily-mcp`, `gordian`, custom MCP servers
- Environment variables and API keys are properly forwarded