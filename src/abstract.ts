import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";

const CACHE_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../cache");

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const server = new McpServer({
    name: "abstract",
    version: "0.1.0"
  });

  server.registerTool(
    "convert_and_store",
    {
      title: "Convert and Store",
      description: "Call any MCP tool, cache full result, return a resourceLink.",
      inputSchema: {
        server: z.string().optional().describe("Upstream MCP base URL"),
        tool: z.string().describe("Tool name on upstream MCP"),
        args: z.record(z.any()).optional().describe("Arguments for that tool")
      }
    },
    async ({ server: upstreamServer, tool, args: toolArgs = {} }) => {
      // TODO: Call actual upstream MCP server when available
      // For now, create a placeholder response
      const data = { 
        message: `Called ${tool} on ${upstreamServer || 'default MCP'} with args`, 
        tool, 
        args: toolArgs,
        timestamp: new Date().toISOString()
      };
      
      const id = uuid() + ".json";
      const file = path.join(CACHE_DIR, id);
      await fs.writeFile(file, JSON.stringify(data, null, 2));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              "@type": "resourceLink",
              uri: `file://${file}`,
              bytes: Buffer.byteLength(JSON.stringify(data))
            })
          }
        ]
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);