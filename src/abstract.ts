import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { 
  loadUpstreamConfigs, 
  callUpstreamTool, 
  listAvailableTools,
  getToolDetails,
  createCacheData,
  generateCacheFilePath,
  generateFilename,
  extractContent,
  createResourceLink,
  validatePath,
  validateDirectory,
  readAndParseFile,
  mergeFileDataWithArgs,
  formatToolResponse,
  ToolInfo
} from "./core.js";

// Parse allowed directories from command line arguments
const allowedDirs = process.argv.slice(2).filter(arg => !arg.startsWith('-'));

// Fallback to cache directory if no directories specified (backward compatibility)
const CACHE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../cache");
const STORAGE_DIRS = allowedDirs.length > 0 ? allowedDirs : [CACHE_DIR];

async function main() {
  // Create storage directories
  for (const dir of STORAGE_DIRS) {
    await fs.mkdir(dir, { recursive: true });
  }
  
  // Log configuration for debugging
  console.error(`Storage directories: ${STORAGE_DIRS.join(', ')}`);
  if (allowedDirs.length === 0) {
    console.error('No storage directories specified. Using default cache directory for backward compatibility.');
    console.error('Usage: node abstract.js <dir1> [dir2] ...');
  }
  
  // Load upstream server configurations
  const upstreamConfigs = await loadUpstreamConfigs();
  
  const server = new McpServer({
    name: "abstract",
    version: "0.1.0"
  });

  server.registerTool(
    "call_tool_and_store",
    {
      title: "Call Tool and Store",
      description: `**Purpose**: Calls upstream MCP tools and caches responses to prevent context bloat. Returns a compact resource link instead of large payloads, keeping conversation context clean while preserving data access.

**When to Use**:
- Expecting large responses that would consume excessive context tokens
- Need to preserve data for later reference without cluttering context
- Working with APIs that return substantial datasets (web search, file contents, database queries)

**Prerequisites**:
- Use list_available_tools first to discover available servers and tools
- Use list_tool_details to understand required parameters for specific tools
- Ensure you know the exact input parameters - never guess parameter names or formats

**Examples**:
\`\`\`json
// Web search with data storage
{
  "server": "tavily-mcp",
  "tool_name": "search", 
  "tool_args": {"query": "latest AI developments 2024"},
  "description": "AI news search results",
  "file_format": "md"
}

// File operations with custom storage
{
  "server": "filesystem",
  "tool_name": "read_file",
  "tool_args": {"path": "/path/to/large-data.json"},
  "storage_path": "/my-projects/data",
  "filename": "imported-data",
  "file_format": "json"
}
\`\`\`

**Security Notes**: Only stores in allowed directories. All upstream tool arguments are passed through unchanged to the target server.`,
      inputSchema: {
        server: z.string().describe("The name of the upstream MCP server. Use list_available_tools to see available options (e.g., 'tavily-mcp', 'filesystem')"),
        tool_name: z.string().describe("The name of the tool to call on the server. Use list_tool_details to see available tools for a server (e.g., 'search', 'read_file', 'get_crypto_prices')"),
        tool_args: z.record(z.any()).optional().describe("Arguments object to pass to the upstream tool. Must match the tool's input schema exactly (e.g., {query: \"search term\"}, {path: \"/file/path\"})"),
        description: z.string().optional().describe("Brief description of what data is being retrieved. Used in resource link metadata (e.g., 'Bitcoin prices 2023-2024', 'Search results for AI companies')"),
        storage_path: z.string().optional().describe("Directory path for storing response file. Must be within allowed directories (use list_allowed_directories to see options). Defaults to first allowed directory"),
        filename: z.string().optional().describe("Custom filename without extension. Defaults to automatic naming: <server>-<tool>-<timestamp> (e.g., 'my-search-results')"),
        file_format: z.enum(["json", "csv", "md", "txt", "html", "yaml", "xml", "tsv"]).optional().describe("Output format for converting the response data. Converts JSON to specified format. Defaults to clean JSON")
      },
      annotations: {
        openWorldHint: true,
        destructiveHint: false
      }
    },
    async ({ server, tool_name, tool_args = {}, description, storage_path, filename, file_format }) => {
      try {
        // Determine target directory
        let targetDir = storage_path || STORAGE_DIRS[0];
        
        // Validate storage path if provided
        if (storage_path) {
          if (!validatePath(storage_path, STORAGE_DIRS)) {
            throw new Error(`Storage path ${storage_path} is not within allowed directories: ${STORAGE_DIRS.join(', ')}`);
          }
          if (!(await validateDirectory(storage_path))) {
            throw new Error(`Storage directory ${storage_path} does not exist or is not writable`);
          }
          targetDir = storage_path;
        }
        
        // Attempt to call the upstream MCP tool
        const upstreamResponse = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
        
        // Use requested format or default to clean JSON
        const targetFormat = file_format || 'json';
        
        // Extract and convert content (removes metadata bloat and converts format)
        const extractedContent = extractContent(upstreamResponse, targetFormat);
        
        // Generate filename (custom or default timestamp-based)
        const generatedFilename = generateFilename(server, tool_name, filename);
        const file = generateCacheFilePath(targetDir, STORAGE_DIRS, generatedFilename, targetFormat);
        
        // Write the extracted content (not the full metadata wrapper)
        await fs.writeFile(file, extractedContent);
        
        // Create cache data for resource link (preserving metadata for link description)
        const cacheData = createCacheData(`${server}:${tool_name}`, tool_args, upstreamResponse, description);

        const resourceLink = createResourceLink(file, cacheData, description || `Response from ${server}:${tool_name}`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resourceLink)
            }
          ]
        };
        
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

  // Tool to list all available upstream tools
  server.registerTool(
    "list_available_tools",
    {
      title: "List Available Tools",
      description: `**Purpose**: Discovers available tools from upstream MCP servers. Returns structured data for easy parsing and tool discovery.

**When to Use**:
- Before calling any upstream tools to see what's available
- To explore capabilities of connected MCP servers
- To validate server and tool names before making calls

**Output Format**: Returns array of objects with \`{server, tool, description, inputSchema?}\` structure

**Examples**:
\`\`\`json
// Basic discovery - list all tools
{}

// Get detailed schemas for all tools
{"detailed": true}

// Focus on specific server
{"filter_by_server": "tavily-mcp"}

// Detailed view of one server
{"detailed": true, "filter_by_server": "filesystem"}
\`\`\`

**Integration**: Use this before \`call_tool_and_store\` to discover valid server and tool_name values.`,
      inputSchema: {
        detailed: z.boolean().optional().describe("Include full input schemas when true. False returns basic info only (server, tool, description). Default: false"),
        filter_by_server: z.string().optional().describe("Restrict listing to one upstream server. Must match exact server name from configuration (e.g., 'tavily-mcp', 'filesystem')")
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false
      }
    },
    async ({ detailed, filter_by_server }) => {
      const availableTools = await listAvailableTools(upstreamConfigs, { 
        detailed: detailed || false, 
        filterByServer: filter_by_server 
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(availableTools, null, 2)
          }
        ]
      };
    }
  );

  // Tool to get detailed information for a specific tool
  server.registerTool(
    "list_tool_details",
    {
      title: "Get Tool Details",
      description: `**Purpose**: Get complete definition for a specific upstream tool including input schema, description, and parameter requirements.

**When to Use**:
- Before calling a tool to understand its exact parameter requirements
- To explore the capabilities and constraints of a specific tool
- To get the full input schema for complex tools with many parameters

**Prerequisites**: Use \`list_available_tools\` first to discover valid server and tool_name combinations.

**Examples**:
\`\`\`json
// Get details for web search tool
{"server": "tavily-mcp", "tool_name": "search"}

// Get details for file operations
{"server": "filesystem", "tool_name": "read_file"}

// Get details for crypto price tool
{"server": "gordian", "tool_name": "get_crypto_prices"}
\`\`\`

**Output**: Returns complete tool definition with input schema, description, and parameter constraints.`,
      inputSchema: {
        server: z.string().describe("The upstream server name. Must match exactly the server names from list_available_tools (e.g., 'tavily-mcp', 'gordian')"),
        tool_name: z.string().describe("The name of the tool to inspect. Must match exactly the tool names from list_available_tools (e.g., 'search', 'get_crypto_prices')")
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false
      }
    },
    async ({ server, tool_name }) => {
      try {
        const toolDetails = await getToolDetails(server, tool_name, upstreamConfigs);
        
        if (!toolDetails) {
          return {
            content: [
              {
                type: "text",
                text: `Tool '${tool_name}' not found on server '${server}'`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(toolDetails, null, 2)
            }
          ]
        };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting tool details: ${errorMessage}`
            }
          ]
        };
      }
    }
  );

  server.registerTool(
    "list_allowed_directories",
    {
      title: "List Allowed Storage Directories",
      description: `**Purpose**: Lists all directories that Abstract is allowed to store responses in. These directories are specified via command line arguments when the server starts.

**When to Use**:
- Before using custom storage_path in call_tool_and_store
- To understand where response files can be stored
- To verify directory permissions and availability

**No Parameters Required**: This tool takes no input parameters.

**Output**: Returns JSON object with allowed_directories array, default_directory, and total count.

**Security Context**: Abstract only stores files within these pre-configured directories to prevent unauthorized file system access.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false
      }
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              allowed_directories: STORAGE_DIRS,
              default_directory: STORAGE_DIRS[0],
              total_directories: STORAGE_DIRS.length
            }, null, 2)
          }
        ]
      };
    }
  );

  server.registerTool(
    "call_tool_with_file_content",
    {
      title: "Call Tool with File Content",
      description: `**Purpose**: Reads structured data from files (CSV, JSON, YAML, XML, TSV, TXT) and passes it to upstream MCP tools. Supports selectable output formats for optimal LLM context management.

**When to Use**:
- Bulk operations requiring large datasets (database inserts, API uploads)
- Processing structured data files without loading them into context
- Automated deployments using configuration files
- Data analysis workflows with external datasets

**File Format Support**: 
- JSON: Direct parsing and passthrough
- CSV/TSV: Converts to array of objects with headers
- YAML: Parses to JSON object structure
- XML: Basic parsing support
- TXT: Attempts JSON parsing, fallback to string

**Output Format Options**:
- \`json\`: Returns full MCP response with metadata (default)
- \`string\`: Returns clean text content, ideal for human-readable responses

**Prerequisites**: 
- File must be within allowed directories (use list_allowed_directories)
- Use list_available_tools and list_tool_details to understand target tool requirements

**Examples**:
\`\`\`json
// Database bulk insert with string output
{
  "server": "database-mcp",
  "tool_name": "bulk_insert", 
  "file_path": "/data/users.csv",
  "data_key": "records",
  "tool_args": {"table": "users"},
  "output_format": "string"
}

// API upload with file content as entire args
{
  "server": "shopify-mcp",
  "tool_name": "create_products",
  "file_path": "/inventory/products.json"
}

// Configuration deployment
{
  "server": "kubernetes-mcp",
  "tool_name": "deploy",
  "file_path": "/configs/app.yaml",
  "data_key": "spec",
  "tool_args": {"namespace": "production"}
}
\`\`\`

**Security Notes**: Files must be within allowed directories. File size limited to 10MB.`,
      inputSchema: {
        server: z.string().describe("The name of the upstream MCP server. Use list_available_tools to see options (e.g., 'database-mcp', 'shopify-mcp')"),
        tool_name: z.string().describe("The name of the tool to call on the server. Use list_tool_details to see requirements (e.g., 'bulk_insert', 'create_products')"),
        file_path: z.string().describe("Path to the input file within allowed directories. Auto-detects format from extension: .json, .csv, .tsv, .yaml, .xml, .txt (max 10MB)"),
        data_key: z.string().optional().describe("Parameter name for injecting file content into tool arguments. If omitted, file content becomes the entire tool arguments object"),
        tool_args: z.record(z.any()).optional().describe("Additional arguments to merge with file data. Cannot contain keys that conflict with data_key parameter"),
        output_format: z.enum(["json", "string"]).optional().describe("Response format: 'json' returns full MCP response with metadata (default), 'string' returns clean text content only")
      },
      annotations: {
        openWorldHint: true,
        destructiveHint: false
      }
    },
    async ({ server, tool_name, file_path, data_key, tool_args, output_format }) => {
      try {
        // Validate file path against allowed directories
        if (!validatePath(file_path, STORAGE_DIRS)) {
          throw new Error(`File path ${file_path} is not within allowed directories: ${STORAGE_DIRS.join(', ')}`);
        }
        
        // Read and parse file content
        const fileContent = await readAndParseFile(file_path);
        
        // Merge file data with tool arguments
        const mergedArgs = mergeFileDataWithArgs(fileContent, data_key, tool_args);
        
        // Call upstream tool with merged arguments
        const upstreamResponse = await callUpstreamTool(server, tool_name, mergedArgs, upstreamConfigs);
        
        // Format response based on selected output format
        const selectedFormat = output_format || 'json'; // Default to JSON for backward compatibility
        const responseText = formatToolResponse(upstreamResponse, selectedFormat);
        
        // Return formatted response (no file storage needed for upload operations)
        return {
          content: [
            {
              type: "text",
              text: responseText
            }
          ]
        };
        
      } catch (error) {
        // Return proper error response if operation fails
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to call tool with file content: ${errorMessage}`);
        
        // Format error response based on selected output format
        const selectedFormat = output_format || 'json';
        let responseText: string;
        
        if (selectedFormat === 'string') {
          responseText = `Error in call_tool_with_file_content: ${errorMessage}`;
        } else {
          responseText = JSON.stringify({
            error: errorMessage,
            tool: `${server}:${tool_name}`,
            timestamp: new Date().toISOString()
          }, null, 2);
        }
        
        return {
          content: [
            {
              type: "text",
              text: responseText
            }
          ],
          isError: true
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);