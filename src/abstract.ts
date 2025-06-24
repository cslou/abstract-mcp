import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";

const CACHE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../cache");

// Load upstream server configurations from MCP client config
async function loadUpstreamConfigs(): Promise<Map<string, any>> {
  const configs = new Map();
  
  // Get config file path from environment
  const configPath = process.env.APP_CONFIG_PATH;
  if (!configPath) {
    console.error('No config file path specified. Set APP_CONFIG_PATH environment variable.');
    console.error('Example: APP_CONFIG_PATH="/Users/you/Library/Application Support/Claude/claude_desktop_config.json"');
    console.error('Or for Cursor: APP_CONFIG_PATH="/Users/you/.cursor/config.json"');
    return configs;
  }
  
  // Get list of servers to proxy from environment
  const proxyServers = process.env.ABSTRACT_PROXY_SERVERS;
  if (!proxyServers) {
    console.error('No upstream servers configured. Set ABSTRACT_PROXY_SERVERS environment variable.');
    console.error('Example: ABSTRACT_PROXY_SERVERS="tavily-mcp,gordian"');
    return configs;
  }
  
  const serverNames = proxyServers.split(',').map(s => s.trim()).filter(s => s);
  
  // Read MCP client config
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    // Support different config structures (Claude uses mcpServers, others might differ)
    const mcpServers = config.mcpServers || config.mcp_servers || config.servers || {};
    
    if (Object.keys(mcpServers).length === 0) {
      console.error('No MCP servers found in config file');
      return configs;
    }
    
    // Extract configurations for specified servers
    for (const serverName of serverNames) {
      if (mcpServers[serverName]) {
        configs.set(serverName, mcpServers[serverName]);
      } else {
        console.error(`Warning: Server ${serverName} not found in config file`);
      }
    }
    
    console.error(`Loaded ${configs.size} upstream server configurations`);
    
  } catch (error) {
    console.error(`Failed to read config from ${configPath}: ${error}`);
    console.error('Make sure the config file exists and contains MCP server configurations');
  }
  
  return configs;
}

// Function to call upstream MCP tools
async function callUpstreamTool(toolName: string, toolArgs: any, upstreamConfigs: Map<string, any>): Promise<any> {
  // Parse tool name to extract server and tool parts
  const [serverName, actualToolName] = toolName.includes(':') 
    ? toolName.split(':', 2)
    : ['unknown', toolName];
  
  console.error(`Attempting to call tool: ${actualToolName} on server: ${serverName}`);
  console.error(`Arguments:`, JSON.stringify(toolArgs, null, 2));
  
  const serverConfig = upstreamConfigs.get(serverName);
  
  if (!serverConfig) {
    throw new Error(`Unknown upstream server: ${serverName}. Available servers: ${Array.from(upstreamConfigs.keys()).join(', ')}`);
  }
  
  // Create a new MCP client to connect to the upstream server via stdio
  const client = new Client({
    name: "abstract-proxy-client",
    version: "1.0.0"
  }, {
    capabilities: {}
  });

  // Merge environment variables: process.env + server-specific env
  const mergedEnv = {
    ...process.env,
    ...(serverConfig.env || {})
  };

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args || [],
    env: mergedEnv as Record<string, string>
  });

  try {
    await client.connect(transport);
    
    const result = await client.request({
      method: 'tools/call',
      params: {
        name: actualToolName,
        arguments: toolArgs
      }
    }, CallToolResultSchema);

    await client.close();
    return result;
    
  } catch (error) {
    await client.close();
    throw error;
  }
}

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
        
        const cacheData = {
          tool_name,
          tool_args,
          response: upstreamResponse,
          description: description || `Response from ${tool_name}`,
          timestamp: new Date().toISOString(),
          type: "upstream_tool_response"
        };
        
        const id = uuid() + ".json";
        const file = path.join(CACHE_DIR, id);
        await fs.writeFile(file, JSON.stringify(cacheData, null, 2));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                "@type": "resourceLink",
                uri: `file://${file}`,
                bytes: Buffer.byteLength(JSON.stringify(cacheData)),
                description: description || `Response from ${tool_name}`
              })
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
      const availableTools: string[] = [];
      
      for (const [serverName, serverConfig] of upstreamConfigs.entries()) {
        try {
          // Try to connect to each server and get its tools
          const client = new Client({
            name: "abstract-discovery-client",
            version: "1.0.0"
          }, {
            capabilities: {}
          });

          const mergedEnv = {
            ...process.env,
            ...(serverConfig.env || {})
          };

          const transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args || [],
            env: mergedEnv as Record<string, string>
          });

          await client.connect(transport);
          
          const toolsList = await client.request({
            method: 'tools/list',
            params: {}
          }, ListToolsResultSchema);

          await client.close();

          // Add tools with server prefix
          if (toolsList.tools) {
            for (const tool of toolsList.tools) {
              availableTools.push(`${serverName}:${tool.name} - ${tool.description || 'No description'}`);
            }
          }
          
        } catch (error) {
          // If we can't connect to a server, note it
          availableTools.push(`${serverName}: Error connecting (${error instanceof Error ? error.message : 'Unknown error'})`);
        }
      }

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