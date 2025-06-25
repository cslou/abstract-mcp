# Abstract MCP Server

A minimal "converter proxy" MCP server that caches large tool responses to user-specified directories and returns compact resource links instead of bulky payloads.

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
    // (Example) Your existing MCP servers (no changes needed!)
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-tavily-api-key"
      }
    },
    
    // Add Abstract - it will use the servers above
    "abstract": {
      "command": "node",
      "args": [
        "/path/to/abstract/dist/abstract.js",
        "/path/to/allowed/storage/dir1",
        "/path/to/allowed/storage/dir2"
      ],
      "cwd": "/path/to/abstract",
      "env": {
        "APP_CONFIG_PATH": "/path/to/claude/desktop/config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,gordian"
      }
    }
  }
}
```

### Config Path Examples

Set `APP_CONFIG_PATH` to your MCP client's config file:

- **Claude Desktop (macOS)**: `/Users/username/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude Desktop (Windows)**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Claude Desktop (Linux)**: `~/.config/Claude/claude_desktop_config.json`
- **Cursor**: `~/.cursor/config.json`
- **Other clients**: Check your client's documentation for config location

Abstract reads this config file to find the settings for servers listed in `ABSTRACT_PROXY_SERVERS`.

## Usage

Abstract provides four tools:

- `call_tool_and_store` - Calls upstream tools and caches responses to specified directories
- `list_available_tools` - Lists all available upstream tools with filtering options
- `list_tool_details` - Gets complete definition for a specific upstream tool
- `list_allowed_directories` - Lists all directories that Abstract is allowed to store responses in

## Directory-Based Storage

Abstract now stores responses in user-specified directories instead of a fixed cache location. You can:

1. **Specify allowed directories** via command line arguments
2. **Choose storage location** per tool call using the `storage_path` parameter
3. **Maintain security** with path validation and sandboxing

### Basic Usage

```json
{
  "server": "tavily-mcp",
  "tool_name": "search", 
  "tool_args": {"query": "bitcoin ETF flows", "max_results": 10},
  "description": "Bitcoin ETF search results"
}
```

### Advanced Usage with Custom Storage

```json
{
  "server": "tavily-mcp",
  "tool_name": "search",
  "tool_args": {"query": "bitcoin ETF flows", "max_results": 10},
  "description": "Bitcoin ETF search results",
  "storage_path": "/path/to/allowed/storage/dir1"
}
```

### Tool Discovery

```json
// List all tools
{"detailed": false}

// List tools with full schemas
{"detailed": true}

// Filter by specific server
{"filter_by_server": "tavily-mcp"}
```

### Directory Discovery

```json
// List allowed storage directories (no parameters needed)
{}
```

Example response:
```json
{
  "allowed_directories": [
    "/path/to/allowed/storage/dir1",
    "/path/to/allowed/storage/dir2"
  ],
  "default_directory": "/path/to/allowed/storage/dir1",
  "total_directories": 2
}
```

The tool returns a compact resource link instead of the full response, keeping your context window clean.

## Backward Compatibility

Abstract maintains full backward compatibility:

- **No directory args**: Falls back to `./cache` directory (original behavior)
- **No storage_path**: Uses first allowed directory as default
- **Existing configurations**: Work without any changes

## Development

- `npm run build` - Compile TypeScript
- `npm run dev` - Build and start server  
- `npm start` - Start the compiled server
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode

## Architecture

```
MCP Client (Claude/Cursor/etc) ──(stdio JSON-RPC)──► Abstract (Node.js)
                                                          │
                                                          ├── Reads client config file
                                                          ├── Validates storage directories
                                                          │
                                                          ▼
                                              Upstream MCP servers (stdio)
                                                          │
                                                          ▼
                                           User-specified directories/<uuid>.json
```

**How it works:**
1. Abstract parses allowed storage directories from command line arguments
2. Reads your MCP client's config file (specified via `APP_CONFIG_PATH`)
3. Extracts configurations for servers listed in `ABSTRACT_PROXY_SERVERS`
4. When tools are called, Abstract validates storage paths and spawns upstream servers
5. Tool responses are cached to user-specified directories with security validation
6. Resource links are returned to the client, keeping large datasets out of conversation context

**Key features:**
- **User-controlled storage**: Store responses in directories you specify
- **Security-first**: Path validation prevents directory traversal attacks
- **Client-agnostic**: Works with Claude Desktop, Cursor, Cline, Windsurf, or any MCP client
- **Zero duplication**: Reuses existing server configurations from your client's config
- **Transparent**: API keys and environment variables are properly forwarded
- **Flexible**: Supports any MCP server that can be spawned via stdio
- **Backward compatible**: Existing setups continue to work without changes

## Security

Abstract implements comprehensive security measures:

- **Path validation**: Prevents directory traversal attacks (e.g., `../../../etc/passwd`)
- **Sandboxed storage**: Files can only be written within allowed directories
- **Permission checks**: Validates directory existence and write permissions
- **Boundary enforcement**: All paths are resolved and checked against allowed directories

## Supported Upstream Servers

- Any MCP server that can be spawned via stdio
- Examples: `tavily-mcp`, `gordian`, `filesystem`, custom MCP servers
- Environment variables and API keys are properly forwarded

## Configuration Examples

### Claude Desktop (macOS)
```json
{
  "mcpServers": {
    "abstract": {
      "command": "node",
      "args": [
        "/path/to/abstract/dist/abstract.js",
        "/Users/username/Documents/mcp-cache",
        "/Users/username/Downloads"
      ],
      "env": {
        "APP_CONFIG_PATH": "/Users/username/Library/Application Support/Claude/claude_desktop_config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,filesystem"
      }
    }
  }
}
```

### Cursor
```json
{
  "mcpServers": {
    "abstract": {
      "command": "node", 
      "args": [
        "/path/to/abstract/dist/abstract.js",
        "/home/username/workspace/data",
        "/tmp/mcp-cache"
      ],
      "env": {
        "APP_CONFIG_PATH": "/home/username/.cursor/config.json",
        "ABSTRACT_PROXY_SERVERS": "filesystem,web-search"
      }
    }
  }
}
```