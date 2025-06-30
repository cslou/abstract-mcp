# Abstract MCP Server

**Prevents large MCP tool responses from consuming your LLM's context window.** Abstract acts as a smart proxy that caches responses to files and returns compact resource links, and supports direct tool calls and file uploads to avoid context bloat.

## Why Abstract?

- **🚀 Preserves Context Window**: Large responses (search results, file contents, API data) don't bloat your conversation
- **💾 Smart Storage**: Responses saved to directories you control with security validation
- **🔄 Format Conversion**: Automatic conversion to CSV, YAML, JSON, Markdown, and more
- **📂 File Uploads**: Inject CSV, JSON, YAML, and other file data into upstream tools without exposing raw content
- **⚡ Direct Calls**: Skip caching when responses are small with plain `call_tool` for instant results
- **🔗 Zero Config**: Works with your existing MCP servers without changes

## Quick Start

1. **Install**: `npm install -g abstract-mcp` (or [build from source](https://github.com/cslou/abstract-mcp))

2. **Add to your MCP client config** (Claude Desktop, Cursor, Cline, etc):

```json
{
  "mcpServers": {    
    "abstract": {
      "command": "abstract-mcp",
      "args": [
        "/path/to/allowed/storage/dir1",
        "/path/to/allowed/storage/dir2"
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/claude/desktop/config.json",
        "ABSTRACT_PROXY_SERVERS": "server1,server2"
      }
    }
  }
}
```

## Example with Existing MCP Servers

Your existing MCP servers work unchanged alongside Abstract. Here's an example configuration:

```json
{
  "mcpServers": {    
    "abstract": {
      "command": "abstract-mcp",
      "args": [
        "/path/to/allowed/storage/dir1",
        "/path/to/allowed/storage/dir2"
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/claude/desktop/config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp"
      }
    },
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-tavily-api-key"
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

## Best Practice: Disable Upstream Tools

For more reliable tool calling, consider disabling the direct tools from upstream servers that you've added to Abstract's `ABSTRACT_PROXY_SERVERS`. This prevents confusion and ensures all calls go through Abstract's enhanced functionality (caching, file handling, format conversion).

**Why?** When both Abstract and upstream servers expose the same tools, AI assistants may randomly choose between them. By disabling upstream tools, you guarantee consistent behavior through Abstract's proxy.

## Core Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `call_tool_and_store` | Cache large responses to files | Web searches, database queries, file operations |
| `call_tool` | Direct tool calls in context | Small responses, status checks, quick calculations |
| `call_tool_with_file_content` | Upload file data to tools | Bulk imports, config deployments, data processing |
| `list_available_tools` | Discover upstream tools | Before calling any upstream tools |
| `list_tool_details` | Get tool parameter schemas | When you need exact parameter requirements |
| `list_allowed_directories` | View storage locations | Before using custom storage paths |

## Usage Examples

### Basic Response Caching
```json
{
  "server": "tavily-mcp",
  "tool_name": "search", 
  "tool_args": {"query": "bitcoin ETF flows", "max_results": 10}
}
```

### Advanced: Custom Storage & Format
```json
{
  "server": "tavily-mcp",
  "tool_name": "search",
  "tool_args": {"query": "bitcoin ETF flows", "max_results": 10},
  "storage_path": "/Users/you/Documents/research",
  "filename": "bitcoin-etf-analysis",
  "file_format": "csv"
}
```

### File Upload to Tools
```json
{
  "server": "database-mcp",
  "tool_name": "bulk_insert",
  "file_path": "/Users/you/Documents/users.csv",
  "data_key": "records",
  "tool_args": {"table": "users"}
}
```

## File Format Support

| Format | Use Case | Example Output |
|--------|----------|----------------|
| `json` | Structured data (default) | Clean JSON without MCP metadata |
| `csv` | Spreadsheet analysis | Headers + data rows |
| `md` | Documentation | Formatted markdown |
| `yaml` | Configuration files | Key-value structured data |
| `txt` | Plain text | Universal format |
| `html` | Web content | Formatted HTML |
| `xml` | API responses | Structured markup |
| `tsv` | Tab-separated data | Excel-compatible format |


## Usage & Performance

### Performance Characteristics
- **Response Time**: ~100-200ms overhead per tool call
- **File I/O**: Asynchronous writes, no blocking operations
- **Memory Usage**: ~20-50MB base + upstream server requirements
- **Concurrency**: Handles multiple simultaneous tool calls
- **File Size Limits**: 10MB per file upload (configurable)

### Monitoring & Observability
```bash
# Logs are written to stderr - capture with your log aggregator
abstract-mcp 2>> /var/log/abstract-mcp.log

# Key log patterns to monitor:
# "Loaded N upstream server configurations" - startup success
# "Failed to call upstream tool" - tool call failures
# "Storage directories:" - directory configuration
```

### Error Handling
| Error Type | Behavior | Recovery |
|------------|----------|----------|
| Upstream server unreachable | Returns error message, continues serving | Check server config and dependencies |
| Storage directory not writable | Fails with clear error message | Verify directory permissions |
| File size exceeded | Rejects upload with size limit error | Use smaller files or increase limit |
| Invalid JSON in config | Logs error, continues with empty config | Fix JSON syntax in config file |

### Security Considerations
- **Path Validation**: All file operations restricted to allowed directories
- **No Code Execution**: Only data processing, no arbitrary command execution
- **Environment Isolation**: Upstream servers inherit environment safely
- **Permission Model**: Requires explicit directory allowlisting

### Scaling & Deployment
- **Horizontal Scaling**: Run multiple instances with different storage directories
- **Load Balancing**: Not required - each client connects to dedicated instance
- **Resource Requirements**: 1 CPU core, 512MB RAM minimum per instance
- **Storage**: Plan for 10GB+ per active user for response caching

### Troubleshooting
```bash
# Test configuration
abstract-mcp /tmp/test-dir
# Should show: "Storage directories: /tmp/test-dir"

# Verify upstream server connectivity
export APP_CONFIG_PATH="/path/to/config.json"
export ABSTRACT_PROXY_SERVERS="tavily-mcp"
# Look for: "Loaded 1 upstream server configurations"

# Check directory permissions
ls -la /your/storage/directory
# Should be writable by the user running abstract-mcp
```

## Development

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run dev` | Build and start development server |
| `npm start` | Start compiled production server |
| `npm test` | Run test suite |
| `npm run test:watch` | Continuous testing during development |

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

## Supported Upstream Servers

- Any MCP server that can be spawned via stdio
- Examples: `tavily-mcp`, `filesystem`, custom MCP servers
- Environment variables and API keys are properly forwarded

---

## Tool Details

### call_tool_and_store
**Purpose**: Calls upstream MCP tools and caches responses to prevent context bloat. Returns compact resource links instead of large payloads.

**Parameters:**
- `server` (required): Upstream MCP server name
- `tool_name` (required): Tool to call on the server
- `tool_args` (optional): Arguments object for the tool
- `description` (optional): Human-readable description for the response
- `storage_path` (optional): Custom directory within allowed paths
- `filename` (optional): Custom filename without extension
- `file_format` (optional): Output format (json|csv|md|txt|html|yaml|xml|tsv)

### call_tool
**Purpose**: Calls upstream MCP tools directly and returns raw responses in conversation context. No caching or file operations.

**Parameters:**
- `server` (required): Upstream MCP server name
- `tool_name` (required): Tool to call on the server
- `tool_args` (optional): Arguments object for the tool

### call_tool_with_file_content
**Purpose**: Reads structured data from files and passes it to upstream MCP tools to help avoid context bloat. Supports JSON and string formats.

**Parameters:**
- `server` (required): Upstream MCP server name
- `tool_name` (required): Tool to call on the server  
- `file_path` (required): Path to input file within allowed directories
- `data_key` (optional): Parameter name for injecting file content
- `tool_args` (optional): Additional arguments to merge with file data
- `output_format` (optional): Response format (json|string)

### list_available_tools
**Purpose**: Discovers available tools from upstream MCP servers with structured output and filtering options.

**Parameters:**
- `detailed` (optional): Include full input schemas when true (default: false)
- `filter_by_server` (optional): Restrict listing to specific upstream server

### list_tool_details
**Purpose**: Gets complete definition for a specific upstream tool including input schema and parameter requirements.

**Parameters:**
- `server` (required): Upstream server name
- `tool_name` (required): Name of the tool to inspect

### list_allowed_directories
**Purpose**: Lists all directories that Abstract is allowed to store responses in. No parameters required.

**Parameters:** None
