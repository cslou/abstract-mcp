import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { 
  loadUpstreamConfigs, 
  callUpstreamTool, 
  listAvailableTools,
  createCacheData,
  generateCacheFilePath,
  createResourceLink
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
      description: "Calls any upstream MCP tool on your behalf, caches the full response to local storage, and returns only a compact resourceLink instead of the bulky payload. This prevents large datasets from bloating the conversation context. USE THIS TOOL when you expect a tool call to return large data that would consume excessive tokens. EXAMPLE: Instead of calling 'gordian:get_historical_crypto_prices' directly (which would return massive JSON), call call_tool_and_store with tool_name: 'gordian:get_historical_crypto_prices' and tool_args: {ticker: 'BTC-USD', start_date: '2023-01-01', end_date: '2024-01-01'}. You'll receive a file reference that can be accessed later via code execution tools without consuming context tokens.",
      inputSchema: {
        tool_name: z.string().describe("The name of the upstream MCP tool to call (e.g., 'gordian:get_historical_crypto_prices', 'tavily:search', 'filesystem:read_file')"),
        tool_args: z.record(z.any()).optional().describe("The arguments to pass to the upstream tool (e.g., {ticker: 'BTC-USD', start_date: '2023-01-01'})"),
        description: z.string().optional().describe("A brief description of what data is being retrieved (e.g., 'Bitcoin prices 2023-2024', 'Search results for AI companies')")
      }
    },
    async ({ tool_name, tool_args = {}, description }) => {
      try {
        // Attempt to call the upstream MCP tool
        const upstreamResponse = await callUpstreamTool(tool_name, tool_args, upstreamConfigs);
        
        const cacheData = createCacheData(tool_name, tool_args, upstreamResponse, description);
        const file = generateCacheFilePath(CACHE_DIR);
        await fs.writeFile(file, JSON.stringify(cacheData, null, 2));

        const resourceLink = createResourceLink(file, cacheData, description || `Response from ${tool_name}`);

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
              text: `Error calling ${tool_name}: ${errorMessage}\n\nTroubleshooting:\n1. Check that APP_CONFIG_PATH points to your MCP client config file\n2. Verify that '${tool_name.split(':')[0]}' is listed in ABSTRACT_PROXY_SERVERS\n3. Ensure the upstream server is properly configured in your MCP client\n4. Check console logs for more details`
            }
          ]
        };
      }
    }
  );

  // Tool to list all available upstream tools
  server.registerTool(
    "list_available_tools",
    {
      title: "List Available Tools",
      description: "Lists all available tools from configured upstream MCP servers. Use this to discover what tools you can call via call_tool_and_store.",
      inputSchema: {}
    },
    async () => {
      const availableTools = await listAvailableTools(upstreamConfigs);

      return {
        content: [
          {
            type: "text",
            text: `Available upstream tools:\n\n${availableTools.join('\n')}\n\nUse call_tool_and_store with tool_name like "servername:toolname" to call any of these tools.`
          }
        ]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);