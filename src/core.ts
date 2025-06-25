import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";

// Load upstream server configurations from MCP client config
export async function loadUpstreamConfigs(): Promise<Map<string, any>> {
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
export async function callUpstreamTool(server: string, toolName: string, toolArgs: any, upstreamConfigs: Map<string, any>): Promise<any> {
  console.error(`Attempting to call tool: ${toolName} on server: ${server}`);
  console.error(`Arguments:`, JSON.stringify(toolArgs, null, 2));
  
  const serverConfig = upstreamConfigs.get(server);
  
  if (!serverConfig) {
    throw new Error(`Unknown upstream server: ${server}. Available servers: ${Array.from(upstreamConfigs.keys()).join(', ')}`);
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
        name: toolName,
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

// Tool discovery result interface
export interface ToolInfo {
  server: string;
  tool: string;
  description: string;
  inputSchema?: object;
}

// Function to get list of available tools from upstream servers
export async function listAvailableTools(
  upstreamConfigs: Map<string, any>, 
  options: { detailed?: boolean; filterByServer?: string } = {}
): Promise<ToolInfo[]> {
  const { detailed = false, filterByServer } = options;
  const availableTools: ToolInfo[] = [];
  
  // Filter servers if specified
  const serversToQuery = filterByServer 
    ? upstreamConfigs.has(filterByServer) 
      ? [[filterByServer, upstreamConfigs.get(filterByServer)]] 
      : []
    : Array.from(upstreamConfigs.entries());
  
  for (const [serverName, serverConfig] of serversToQuery) {
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

      // Add tools with structured format
      if (toolsList.tools) {
        for (const tool of toolsList.tools) {
          const toolInfo: ToolInfo = {
            server: serverName,
            tool: tool.name,
            description: tool.description || 'No description'
          };
          
          if (detailed && tool.inputSchema) {
            toolInfo.inputSchema = tool.inputSchema;
          }
          
          availableTools.push(toolInfo);
        }
      }
      
    } catch (error) {
      // If we can't connect to a server, note it as an error entry
      availableTools.push({
        server: serverName,
        tool: "ERROR",
        description: `Error connecting: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  return availableTools;
}

// Function to get detailed information for a specific tool
export async function getToolDetails(
  server: string, 
  toolName: string, 
  upstreamConfigs: Map<string, any>
): Promise<ToolInfo | null> {
  const serverConfig = upstreamConfigs.get(server);
  
  if (!serverConfig) {
    throw new Error(`Unknown upstream server: ${server}. Available servers: ${Array.from(upstreamConfigs.keys()).join(', ')}`);
  }

  try {
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

    // Find the specific tool
    if (toolsList.tools) {
      const tool = toolsList.tools.find(t => t.name === toolName);
      if (tool) {
        return {
          server,
          tool: tool.name,
          description: tool.description || 'No description',
          inputSchema: tool.inputSchema
        };
      }
    }
    
    return null;
    
  } catch (error) {
    throw new Error(`Failed to get tool details from ${server}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Function to create cache data
export function createCacheData(toolName: string, toolArgs: any, response: any, description?: string) {
  return {
    tool_name: toolName,
    tool_args: toolArgs,
    response: response,
    description: description || `Response from ${toolName}`,
    timestamp: new Date().toISOString(),
    type: "upstream_tool_response"
  };
}

// Function to generate cache file path
export function generateCacheFilePath(cacheDir: string): string {
  const id = uuid() + ".json";
  return path.join(cacheDir, id);
}

// Function to create resource link
export function createResourceLink(filePath: string, data: any, description?: string) {
  return {
    "@type": "resourceLink",
    uri: `file://${filePath}`,
    bytes: Buffer.byteLength(JSON.stringify(data)),
    description: description || "Cached tool response"
  };
}