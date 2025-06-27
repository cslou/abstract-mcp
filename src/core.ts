import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";

// Directory validation function to prevent path traversal attacks
export function validatePath(targetPath: string, allowedDirs: string[]): boolean {
  try {
    const resolved = path.resolve(targetPath);
    return allowedDirs.some(dir => {
      const allowedDir = path.resolve(dir);
      return resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir;
    });
  } catch {
    return false;
  }
}

// Check if directory exists and is writable
export async function validateDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      return false;
    }
    // Try to write a test file to check permissions
    const testFile = path.join(dirPath, '.write-test');
    await fs.writeFile(testFile, '');
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

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

// Function to extract actual content from MCP JSON wrapper
export function extractActualContent(response: any): any {
  // Handle MCP content wrapper structure
  if (response?.content && Array.isArray(response.content)) {
    if (response.content.length === 1 && response.content[0].type === 'text') {
      const textContent = response.content[0].text;
      
      // Try to parse as JSON if it looks like structured data
      try {
        return JSON.parse(textContent);
      } catch {
        // Return as plain text if not JSON
        return textContent;
      }
    }
    
    // Multiple content items - return the content array
    return response.content;
  }
  
  // Already clean data (non-MCP response)
  return response;
}

// Function to extract and convert content based on target format
export function extractContent(response: any, format: string = 'json'): string {
  // Step 1: Extract actual content from MCP wrapper
  const actualContent = extractActualContent(response);
  
  // Step 2: Convert to requested format (default to clean JSON)
  switch (format) {
    case 'json':
      // Clean JSON without MCP metadata wrapper
      return JSON.stringify(actualContent, null, 2);
    
    case 'txt':
    case 'md':
      // Convert to plain text
      if (typeof actualContent === 'string') {
        return actualContent;
      }
      // Fallback to JSON string for complex objects
      return JSON.stringify(actualContent, null, 2);
    
    case 'html':
      return extractHtmlContent(actualContent);
    
    case 'csv':
      // Convert to CSV - only works for tabular data
      if (Array.isArray(actualContent) && actualContent.length > 0 && 
          typeof actualContent[0] === 'object' && actualContent[0] !== null &&
          !Array.isArray(actualContent[0])) {
        return convertArrayToCSV(actualContent);
      }
      // Fallback: if not tabular, store as JSON with warning
      console.warn('Content is not tabular data, storing as JSON with .csv extension');
      return JSON.stringify(actualContent, null, 2);
    
    case 'tsv':
      // Convert to TSV - only works for tabular data
      if (Array.isArray(actualContent) && actualContent.length > 0 && 
          typeof actualContent[0] === 'object' && actualContent[0] !== null &&
          !Array.isArray(actualContent[0])) {
        return convertArrayToTSV(actualContent);
      }
      // Fallback: if not tabular, store as JSON with warning
      console.warn('Content is not tabular data, storing as JSON with .tsv extension');
      return JSON.stringify(actualContent, null, 2);
    
    case 'yaml':
      return extractYamlContent(actualContent);
    
    case 'xml':
      return extractXmlContent(actualContent);
    
    default:
      // Unknown format - default to JSON
      console.warn(`Unknown format '${format}', defaulting to JSON`);
      return JSON.stringify(actualContent, null, 2);
  }
}

// Helper function to convert array of objects to CSV
function convertArrayToCSV(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        const stringValue = value !== null && value !== undefined ? String(value) : '';
        // Escape commas and quotes properly
        return stringValue.includes(',') || stringValue.includes('"') 
          ? `"${stringValue.replace(/"/g, '""')}"` 
          : stringValue;
      }).join(',')
    )
  ];
  return csvRows.join('\n');
}

// Helper function to convert array of objects to TSV
function convertArrayToTSV(data: any[]): string {
  if (!Array.isArray(data) || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const tsvRows = [
    headers.join('\t'),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        return value !== null && value !== undefined ? String(value) : '';
      }).join('\t')
    )
  ];
  return tsvRows.join('\n');
}

// Helper function to extract HTML content
function extractHtmlContent(actualContent: any): string {
  // Convert to string representation
  const textContent = typeof actualContent === 'string' 
    ? actualContent 
    : JSON.stringify(actualContent, null, 2);
  
  // If it's already HTML, return as-is
  if (textContent.includes('<html') || textContent.includes('<!DOCTYPE') || 
      (textContent.includes('<') && textContent.includes('>'))) {
    return textContent;
  }
  
  // Otherwise wrap in basic HTML structure
  return `<!DOCTYPE html>
<html>
<head>
    <title>Response</title>
</head>
<body>
<pre>${textContent}</pre>
</body>
</html>`;
}



// Helper function to extract YAML content
function extractYamlContent(actualContent: any): string {
  // Simple YAML conversion for objects
  if (typeof actualContent === 'object' && actualContent !== null) {
    return convertToYaml(actualContent, 0);
  }
  
  // If it's a string and already YAML-like, return as-is
  if (typeof actualContent === 'string' && 
      (actualContent.includes(':\n') || actualContent.includes(': '))) {
    return actualContent;
  }
  
  // Convert to string representation
  return typeof actualContent === 'string' 
    ? actualContent 
    : JSON.stringify(actualContent, null, 2);
}

// Helper function to convert object to YAML
function convertToYaml(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (Array.isArray(obj)) {
    return obj.map(item => `${spaces}- ${convertToYaml(item, indent + 1).trim()}`).join('\n');
  }
  
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${spaces}${key}:\n${convertToYaml(value, indent + 1)}`;
        }
        return `${spaces}${key}: ${value}`;
      })
      .join('\n');
  }
  
  return String(obj);
}

// Helper function to extract XML content
function extractXmlContent(actualContent: any): string {
  // Convert to string representation first
  const textContent = typeof actualContent === 'string' 
    ? actualContent 
    : JSON.stringify(actualContent, null, 2);
  
  // If it's already XML, return as-is
  if (textContent.startsWith('<?xml') || 
      (textContent.includes('<') && textContent.includes('</'))) {
    return textContent;
  }
  
  // Simple XML conversion for objects
  if (typeof actualContent === 'object' && actualContent !== null) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${convertToXml(actualContent, 1)}\n</root>`;
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>${textContent}</root>`;
}

// Helper function to convert object to XML
function convertToXml(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (Array.isArray(obj)) {
    return obj.map(item => `${spaces}<item>${convertToXml(item, 0)}</item>`).join('\n');
  }
  
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${spaces}<${key}>\n${convertToXml(value, indent + 1)}\n${spaces}</${key}>`;
        }
        return `${spaces}<${key}>${value}</${key}>`;
      })
      .join('\n');
  }
  
  return String(obj);
}



// Function to generate filename with timestamp-based naming
export function generateFilename(server: string, toolName: string, customName?: string): string {
  if (customName) return customName;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${server}-${toolName}-${timestamp}`;
}

// Function to get file extension for format
export function getFileExtension(format: string): string {
  switch (format) {
    case 'csv': return '.csv';
    case 'tsv': return '.tsv';
    case 'md': return '.md';
    case 'txt': return '.txt';
    case 'html': return '.html';
    case 'yaml': return '.yaml';
    case 'xml': return '.xml';
    case 'json':
    default: return '.json';
  }
}

// Function to generate cache file path with directory validation
export function generateCacheFilePath(targetDir: string, allowedDirs?: string[], filename?: string, format?: string): string {
  // If allowedDirs provided, validate the target directory
  if (allowedDirs && !validatePath(targetDir, allowedDirs)) {
    throw new Error(`Target directory ${targetDir} is not within allowed directories: ${allowedDirs.join(', ')}`);
  }
  
  const extension = getFileExtension(format || 'json');
  const finalFilename = filename ? `${filename}${extension}` : `${uuid()}${extension}`;
  return path.join(targetDir, finalFilename);
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