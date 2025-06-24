# Abstract MCP Server

A minimal "converter proxy" that runs as a local Model Context Protocol (MCP) server. It exposes a single tool—`convert_and_store`—which calls upstream MCP tools, caches responses to local storage, and returns resource links to keep large data out of the LLM context window.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

## Claude Desktop Configuration

Add to your Claude Desktop settings (*Settings ▸ Developer ▸ Edit Config*):

```json
{
  "mcpServers": {
    "abstract": {
      "command": "node",
      "args": ["/path/to/abstract/dist/abstract.js"],
      "cwd": "/path/to/abstract"
    }
  }
}
```

## Usage

The server provides the `convert_and_store` tool that:

1. Calls any upstream MCP tool on your behalf
2. Caches the full response to `./cache/`
3. Returns a resource link instead of the full payload

**Example usage:**
```
Use convert_and_store to call 'search' tool with query 'bitcoin ETF flows'
```

## Development

- `npm run build` - Compile TypeScript
- `npm run dev` - Build and start server
- `npm start` - Start the compiled server

## Architecture

```
Claude Desktop ──(stdio JSON-RPC)──► Abstract (Node.js)
                                         │
                                         ▼
                                ./cache/<uuid>.json
```

The server currently simulates upstream MCP calls. To integrate with real upstream servers, implement the MCP client calls in the `convert_and_store` tool handler.