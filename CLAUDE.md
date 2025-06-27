# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Todo
- [x] Create initial tests 
- [x] Think through list_available_tools (see what is the response)
- [x] Determine where we should store the content
- [x] Convert to different files
- [x] Must inform agent in description to add in file type based on available information
- [x] Call tool and upload from file (E.g. for endpoints that requests a json or txt)
- [ ] publish to npm

## Commands

### Build and Development
- `npm run build` - Compile TypeScript to dist/
- `npm run dev` - Build and start the server
- `npm start` - Start the compiled server from dist/
- `tsc` - Direct TypeScript compilation

### Testing
- `npm test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode for development
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Run tests with coverage report

**Test Framework**: Vitest with TypeScript support
**Test Structure**:
- `tests/unit/` - Unit tests for core functions
- `tests/integration/` - Integration tests for MCP server
- `tests/fixtures/` - Test data and mock configurations
- `tests/helpers/` - Test utilities and mocks
## Architecture Overview

**Abstract** is an MCP (Model Context Protocol) server that acts as a caching proxy for other MCP servers. It solves the problem of large tool responses consuming excessive context tokens by caching responses locally and returning compact resource links instead.

### Core Components

- **Main Server** (`src/abstract.ts`): MCP server implementation with tool registration
- **Core Logic** (`src/core.ts`): Content extraction, format conversion, and upstream server communication
- **Storage System**: User-specified directories with command-line configuration (replaces fixed cache directory)
- **Configuration**: Environment-driven setup that reads existing MCP client configs

### Key Architecture Patterns

1. **Proxy Pattern**: Abstract sits between MCP clients and upstream MCP servers
2. **Configuration Discovery**: Reads existing MCP client config files to avoid duplication
3. **Stdio Transport**: All MCP communication uses stdio JSON-RPC
4. **Resource Links**: Returns file:// URIs instead of large data payloads
5. **Structured APIs**: Tool discovery returns structured objects for reliable parsing
6. **Selective Detail**: Two-tier discovery (basic/detailed) optimizes token usage
7. **Directory-Based Storage**: User-controlled storage locations with security validation
8. **Smart Format Conversion**: Extracts actual content from MCP wrappers and converts between formats

### Data Flow

```
MCP Client → Abstract → Upstream MCP Server → Content Extraction → Format Conversion → User Directory → Resource Link
```

1. Client calls `call_tool_and_store` with tool name, args, and optional storage parameters
2. Abstract spawns upstream server using config from client's config file
3. Response content is extracted from MCP JSON wrapper
4. Content is converted to requested format (JSON, CSV, YAML, etc.)
5. File is stored in user-specified directory with meaningful filename
6. Client receives a resource link pointing to the stored file

## Configuration Requirements

### Command Line Arguments
Abstract accepts directory arguments for storage locations:
```bash
node dist/abstract.js /path/to/allowed/directory1 /path/to/allowed/directory2
```

### Environment Variables
- **`APP_CONFIG_PATH`**: Path to MCP client's config file (e.g., Claude Desktop's config)
- **`ABSTRACT_PROXY_SERVERS`**: Comma-separated list of upstream server names to proxy

### Example Configuration
```json
{
  "mcpServers": {
    "abstract": {
      "command": "node",
      "args": [
        "dist/abstract.js",
        "/Users/you/Desktop/mcp-outputs",
        "/Users/you/Documents/data"
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/claude_desktop_config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,filesystem"
      }
    }
  }
}
```

The server automatically merges process.env with server-specific environment variables when spawning upstream servers.

## Tools Provided

- `call_tool_and_store`: Calls upstream tools with smart storage and format conversion
- `list_available_tools`: Discovers available tools with structured output and filtering options  
- `list_tool_details`: Gets complete definition for a specific upstream tool
- `list_allowed_directories`: Shows all allowed storage directories configured via command line
- `call_tool_with_file_content`: Reads structured data from files and passes it to upstream MCP tools

### Tool Discovery API

**`list_available_tools`** - Enhanced structured output:
- Input: `{detailed?: boolean, filter_by_server?: string}`
- Output: Array of `{server, tool, description, inputSchema?}` objects
- Examples:
  - Basic: `list_available_tools` with `{}`
  - Detailed: `list_available_tools` with `{detailed: true}`
  - Filtered: `list_available_tools` with `{filter_by_server: "tavily-mcp"}`

**`list_tool_details`** - Single tool inspection:
- Input: `{server: string, tool_name: string}`
- Output: Complete tool definition with schema
- Example: `list_tool_details` with `{server: "tavily-mcp", tool_name: "search"}`

### Enhanced Storage Features

**`call_tool_and_store`** - Enhanced with flexible storage options:
- **`storage_path`**: Custom directory for storing response (must be within allowed directories)
- **`filename`**: Custom filename without extension (defaults to `<server>-<tool>-<timestamp>`)
- **`file_format`**: Output format conversion from JSON to: `json`, `csv`, `md`, `txt`, `html`, `yaml`, `xml`, `tsv`

### Key Insight: Format Conversion vs Detection

All MCP responses are JSON-structured. The `file_format` parameter specifies **conversion** from JSON to the desired format, not detection of input format. This enables:

- **CSV output**: Converts JSON arrays to proper CSV with headers and data rows
- **YAML output**: Converts JSON objects to YAML format  
- **Plain text**: Extracts text content from JSON wrappers
- **Clean JSON**: Removes MCP metadata wrapper, stores actual content only

### File Upload Features

**`call_tool_with_file_content`** - Reads structured data from files and passes it to upstream tools:
- Input: `{server: string, tool_name: string, file_path: string, data_key?: string, tool_args?: object}`
- **`file_path`**: Path to input file (must be within allowed directories)
- **`data_key`**: Parameter name for file content in tool arguments (optional)
- **`tool_args`**: Additional arguments to merge with file data (optional)
- **Supported formats**: JSON, CSV, TSV, YAML, XML, TXT with automatic format detection
- **Use cases**: Database bulk inserts, API uploads, configuration deployments

Examples:
- Database bulk insert: `{server: "database-mcp", tool_name: "bulk_insert", file_path: "/data/users.csv", data_key: "records", tool_args: {table: "users"}}`
- API upload: `{server: "shopify-mcp", tool_name: "create_products", file_path: "/inventory/products.json", data_key: "products"}`
- Simple processing: `{server: "processor-mcp", tool_name: "analyze", file_path: "/logs/data.json"}`

## Development Notes

- Uses ES modules (`"type": "module"` in package.json)
- TypeScript with strict mode enabled
- Dependencies: MCP SDK, uuid for file naming, zod for validation
- No linting or type checking commands currently configured
- Files are stored with meaningful names and appropriate extensions
- Security: Path validation prevents directory traversal attacks
- Backward compatibility: Falls back to cache directory if no directories specified

### File Storage Behavior

- **Content Extraction**: Removes MCP JSON wrapper to store actual content
- **Format-Specific Extensions**: `.csv`, `.yaml`, `.xml`, etc. based on conversion format
- **Meaningful Filenames**: `<server>-<tool>-<timestamp>` pattern instead of UUIDs
- **Directory Security**: All paths validated against allowed directories list

## Error Handling

The server gracefully handles:
- Missing configuration files or environment variables
- Upstream server connection failures
- Tool call failures with detailed error messages
- Missing upstream server configurations
- Invalid storage paths (directory traversal protection)
- Format conversion failures (fallback to JSON with warnings)
- Permission issues with storage directories

All errors are logged to stderr and returned as proper MCP error responses to the client.

## Additional Documentation

For detailed technical information, see:
- `docs/storage.md` - Complete storage strategy and implementation details
- `docs/tools.md` - Tool discovery and inspection system documentation