# Call Tool Function Implementation

This document outlines the implementation of the `call_tool` function and provides guidance on when to use each of Abstract's tool calling variants.

## Tool Calling Strategy Decision Matrix

**CRITICAL FOR LLM/AGENT DECISION MAKING**: Always choose the right tool based on expected response size and data handling needs:

### 🔍 `call_tool` - Direct Raw Responses
**Use When**:
- Expected response is small (< 1000 tokens estimated). For example if you are returning 10 years of daily data, it is unlikely to be small.
- Need immediate data in conversation context
- Simple queries or commands with compact outputs
- Testing or debugging upstream tools
- Single-use data that doesn't need preservation

**Examples**:
- Status checks, simple queries, small API responses
- Mathematical calculations, unit conversions
- Brief search queries with limited results
- Configuration lookups, small file reads

### 💾 `call_tool_and_store` - Large Response Caching
**Use When**:
- Response is large (> 1000 tokens estimated)
- Data needs to be preserved for later reference
- Multiple large records, extensive search results, or large documents
- Working with APIs that return substantial datasets
- Context token conservation is important

**Examples**:
- Web search results, database queries with many rows
- Large file contents, API documentation
- Comprehensive reports, detailed analysis results
- Bulk data exports, extensive listings

### 📁 `call_tool_with_file_content` - File-Based Operations
**Use When**:
- Need to upload/send file contents to upstream tools
- Bulk operations with structured data
- File-based configuration or data deployment
- Processing large datasets from files

**Examples**:
- Database bulk inserts, API uploads
- Configuration deployments, batch processing
- Data analysis with external datasets

## Implementation

Add this tool registration to `src/abstract.ts`:

```typescript
server.registerTool(
  "call_tool",
  {
    title: "Call Upstream Tool",
    description: `**Purpose**: Calls upstream MCP tools directly and returns the raw response in conversation context. No caching or file operations.

**⚠️ IMPORTANT DECISION CRITERIA**:
- **Use call_tool**: For small responses (< 1000 tokens) that you need immediately in context. For example if you are returning 10 years of daily data, it is unlikely to be small.
- **Use call_tool_and_store**: For large responses (> 1000 tokens) that would consume excessive context tokens
- **Use call_tool_with_file_content**: When you need to send file data to upstream tools

**When to Use call_tool**:
- Simple queries with compact outputs (status checks, calculations, brief searches)
- Testing or debugging upstream tools
- Single-use data that doesn't need preservation
- When you need the response immediately available for further processing

**When NOT to Use call_tool**:
- If response might be large (web search results, file contents, database queries with many rows)
- If you want to preserve the data for later reference
- If you're sending file data to the upstream tool

**Prerequisites**:
- Use list_available_tools first to discover available servers and tools
- Use list_tool_details to understand required parameters for specific tools
- Ensure you know the exact input parameters - never guess parameter names or formats

**Examples**:
\`\`\`json
// Simple status check
{
  "server": "system-mcp",
  "tool_name": "get_status",
  "tool_args": {}
}

// Quick calculation
{
  "server": "calculator-mcp", 
  "tool_name": "calculate",
  "tool_args": {"expression": "25 * 0.08"}
}

// Brief search (expecting few results)
{
  "server": "tavily-mcp",
  "tool_name": "search",
  "tool_args": {"query": "current bitcoin price", "max_results": 2}
}
\`\`\`

**⚠️ Context Management Warning**: This tool returns full responses directly to conversation context. Use call_tool_and_store for large responses to prevent context bloat.`,
    inputSchema: {
      server: z.string().describe("The name of the upstream MCP server. Use list_available_tools to see available options (e.g., 'tavily-mcp', 'filesystem')"),
      tool_name: z.string().describe("The name of the tool to call on the server. Use list_tool_details to see available tools for a server (e.g., 'search', 'read_file', 'get_crypto_prices')"),
      tool_args: z.record(z.any()).optional().describe("Arguments object to pass to the upstream tool. Must match the tool's input schema exactly (e.g., {query: \"search term\"}, {path: \"/file/path\"})")
    },
    annotations: {
      openWorldHint: true,
      destructiveHint: false
    }
  },
  async ({ server, tool_name, tool_args = {} }) => {
    try {
      // Call upstream tool directly
      const upstreamResponse = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
      
      // Return raw response directly (no caching, no file storage)
      return upstreamResponse;
      
    } catch (error) {
      // Return proper error response if upstream call fails
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to call upstream tool: ${errorMessage}`);
      
      return {
        content: [
          {
            type: "text",  
            text: `Error calling ${server}:${tool_name}: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }
);
```

## Decision Flow for LLM/Agent

When an LLM/Agent needs to call an upstream tool, follow this decision tree:

```
1. Do I need to send file contents to the tool?
   └── YES → Use call_tool_with_file_content
   └── NO → Continue to step 2

2. Is the expected response large (>1000 tokens)?
   Examples of large responses:
   - Web search results with multiple detailed entries
   - File contents (especially large files)
   - Database queries returning many rows
   - Comprehensive reports or documentation
   - API responses with extensive data
   
   └── YES → Use call_tool_and_store
   └── NO → Continue to step 3

3. Do I need this data preserved for later reference?
   └── YES → Use call_tool_and_store
   └── NO → Use call_tool
```

## Response Format Differences

### `call_tool`
- Returns raw MCP response directly
- Full response appears in conversation context
- Immediate access to all data
- No file creation

### `call_tool_and_store`
- Returns resource link only
- Response cached to file with format conversion
- Minimal context usage
- File created in specified directory

### `call_tool_with_file_content`
- Reads file, calls tool with file data
- Can return raw response or formatted response
- No file creation (upload operation)
- File must exist in allowed directories

## Integration Notes

- All three tools share the same `callUpstreamTool` core function
- All use the same upstream server configuration system
- All support the same error handling patterns
- Discovery tools (`list_available_tools`, `list_tool_details`) work with all variants

## Error Handling

The `call_tool` function uses the same error handling pattern as existing tools:
- Catches upstream tool errors
- Logs errors to stderr
- Returns proper MCP error response format
- Includes specific error context (`server:tool_name`)

## Performance Considerations

- `call_tool`: Fastest, no I/O operations
- `call_tool_and_store`: Slower due to file I/O, but saves context tokens
- `call_tool_with_file_content`: Slowest due to file reading + upstream call

Choose based on response size and context management needs, not performance alone. 