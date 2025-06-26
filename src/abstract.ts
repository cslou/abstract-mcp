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
      description: "Calls upstream MCP tools and caches responses to prevent context bloat. Returns a compact resource link instead of large payloads, keeping conversation context clean while preserving data access.\n\nCommon usage patterns:\n- Web search: {server: \"tavily-mcp\", tool_name: \"search\", tool_args: {query: \"AI news\"}}\n- File operations: {server: \"filesystem\", tool_name: \"read_file\", tool_args: {path: \"/path/to/file\"}}\n\nUse this when expecting large responses that would consume excessive context tokens. Note: make sure you know the input params before calling the tool. Do not ever guess.",
      inputSchema: {
        server: z.string().describe("The name of the upstream MCP server (e.g., 'tavily-mcp', 'filesystem')"),
        tool_name: z.string().describe("The name of the tool to call on the server (e.g., 'search', 'read_file', 'get_crypto_prices')"),
        tool_args: z.record(z.any()).optional().describe("The arguments object to pass to the upstream tool (e.g., {query: \"search term\"})"),
        description: z.string().optional().describe("A brief description of what data is being retrieved (e.g., 'Bitcoin prices 2023-2024', 'Search results for AI companies')"),
        storage_path: z.string().optional().describe("Directory path for storing response (must be within allowed directories). Defaults to first allowed directory if not specified."),
        filename: z.string().optional().describe("Custom filename (without extension). Defaults to <server>-<tool>-<timestamp>"),
        file_format: z.enum(["json", "csv", "md", "txt", "html", "yaml", "xml", "tsv"]).optional().describe("Output format for CONVERSION from JSON. Defaults to clean JSON if not specified.")
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
      description: "Discovers available tools from upstream MCP servers. Returns structured data for easy parsing.\n\nExamples:\n- Basic discovery: list_available_tools with {}\n- Detailed schemas: list_available_tools with {detailed: true}\n- Filter by server: list_available_tools with {filter_by_server: \"tavily-mcp\"}",
      inputSchema: {
        detailed: z.boolean().optional().describe("Include full input schemas when true (default: false)"),
        filter_by_server: z.string().optional().describe("Restrict listing to one upstream server (e.g., 'tavily-mcp')")
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
      description: "Get complete definition for a specific upstream tool including input schema.\n\nExample: list_tool_details with {server: \"tavily-mcp\", tool_name: \"search\"}",
      inputSchema: {
        server: z.string().describe("The upstream server name (e.g., 'tavily-mcp', 'gordian')"),
        tool_name: z.string().describe("The name of the tool to inspect (e.g., 'search', 'get_crypto_prices')")
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
      description: "Lists all directories that Abstract is allowed to store responses in. These directories are specified via command line arguments when the server starts.",
      inputSchema: {}
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
      description: "Reads structured data from files (CSV, JSON, YAML, XML, TSV, TXT) and passes it to upstream MCP tools. Supports selectable output formats for optimal LLM context management.\\n\\nOutput Format Options:\\n- 'json': Returns full MCP response with metadata (default)\\n- 'string': Returns clean text content, ideal for human-readable responses\\n\\nExamples:\\n- Database bulk insert: {server: \\\"database-mcp\\\", tool_name: \\\"bulk_insert\\\", file_path: \\\"/data/users.csv\\\", data_key: \\\"records\\\", tool_args: {table: \\\"users\\\"}, output_format: \\\"string\\\"}\\n- API upload: {server: \\\"shopify-mcp\\\", tool_name: \\\"create_products\\\", file_path: \\\"/inventory/products.json\\\", data_key: \\\"products\\\"}\\n- Simple processing: {server: \\\"processor-mcp\\\", tool_name: \\\"analyze\\\", file_path: \\\"/logs/data.json\\\", output_format: \\\"string\\\"}",
      inputSchema: {
        server: z.string().describe("The name of the upstream MCP server (e.g., 'database-mcp', 'shopify-mcp')"),
        tool_name: z.string().describe("The name of the tool to call on the server (e.g., 'bulk_insert', 'create_products')"),
        file_path: z.string().describe("Path to the input file (must be within allowed directories). Supported formats: JSON, CSV, TSV, YAML, XML, TXT"),
        data_key: z.string().optional().describe("Parameter name for file content in tool arguments. If not provided, file content becomes the entire tool arguments"),
        tool_args: z.record(z.any()).optional().describe("Additional arguments to merge with file data. Will error if data_key conflicts with existing keys"),
        output_format: z.enum(["json", "string"]).optional().describe("Output format for the response. 'json' returns full MCP response with metadata (default), 'string' returns clean text content")
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