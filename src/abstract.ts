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
  createResourceLink,
  ToolInfo
} from "./core.js";

const CACHE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../cache");


async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  
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
        description: z.string().optional().describe("A brief description of what data is being retrieved (e.g., 'Bitcoin prices 2023-2024', 'Search results for AI companies')")
      }
    },
    async ({ server, tool_name, tool_args = {}, description }) => {
      try {
        // Attempt to call the upstream MCP tool
        const upstreamResponse = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
        
        const cacheData = createCacheData(`${server}:${tool_name}`, tool_args, upstreamResponse, description);
        const file = generateCacheFilePath(CACHE_DIR);
        await fs.writeFile(file, JSON.stringify(cacheData, null, 2));

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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);