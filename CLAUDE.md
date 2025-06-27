# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Todo
- [x] Create initial tests 
- [x] Think through list_available_tools (see what is the response)
- [x] Determine where we should store the content
- [x] Convert to different files
- [x] Must inform agent in description to add in file type based on available information
- [ ] Call tool and upload from file (E.g. for endpoints that requests a json or txt)
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

- **Main Server** (`src/abstract.ts`): Single-file implementation containing the entire MCP server
- **Cache Directory** (`cache/`): Local JSON storage for tool responses
- **Configuration**: Environment-driven setup that reads existing MCP client configs

### Key Architecture Patterns

1. **Proxy Pattern**: Abstract sits between MCP clients and upstream MCP servers
2. **Configuration Discovery**: Reads existing MCP client config files to avoid duplication
3. **Stdio Transport**: All MCP communication uses stdio JSON-RPC
4. **Resource Links**: Returns file:// URIs instead of large data payloads
5. **Structured APIs**: Tool discovery returns structured objects for reliable parsing
6. **Selective Detail**: Two-tier discovery (basic/detailed) optimizes token usage

### Data Flow

```
MCP Client → Abstract → Upstream MCP Server → Cache → Resource Link
```

1. Client calls `call_tool_and_store` with tool name and args
2. Abstract spawns upstream server using config from client's config file
3. Response is cached to `cache/<uuid>.json`
4. Client receives a resource link pointing to the cached file

## Configuration Requirements

Abstract requires two environment variables:

- **`APP_CONFIG_PATH`**: Path to MCP client's config file (e.g., Claude Desktop's config)
- **`ABSTRACT_PROXY_SERVERS`**: Comma-separated list of upstream server names to proxy

The server automatically merges process.env with server-specific environment variables when spawning upstream servers.

## Tools Provided

- `call_tool_and_store`: Calls upstream tools and caches responses
- `list_available_tools`: Discovers available tools with structured output and filtering options
- `list_tool_details`: Gets complete definition for a specific upstream tool

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

## Development Notes

- Uses ES modules (`"type": "module"` in package.json)
- TypeScript with strict mode enabled
- Dependencies: MCP SDK, uuid for cache file naming, zod for validation
- No linting or type checking commands currently configured
- Cache files are stored with descriptive metadata including tool name, args, timestamp

## Error Handling

The server gracefully handles:
- Missing configuration files or environment variables
- Upstream server connection failures
- Tool call failures with detailed error messages
- Missing upstream server configurations

All errors are logged to stderr and returned as proper MCP error responses to the client.