import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";
import { mockEnvVars, getFixturePath } from '../helpers/test-utils.js';

// Mock the modules
vi.mock("@modelcontextprotocol/sdk/server/mcp.js");
vi.mock("@modelcontextprotocol/sdk/server/stdio.js");
vi.mock("node:fs/promises");

describe('Abstract MCP Server Integration', () => {
  const mockServer = {
    registerTool: vi.fn(),
    connect: vi.fn()
  };

  const mockTransport = {};
  const fsMocks = {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn()
  };

  beforeEach(() => {
    // Don't clear mocks between tests to maintain state
    vi.mocked(McpServer).mockImplementation(() => mockServer as any);
    vi.mocked(StdioServerTransport).mockImplementation(() => mockTransport as any);
    Object.assign(fs, fsMocks);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should register both tools on server startup', async () => {
    const configContent = JSON.stringify({
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['/fake/path/server.js'],
          env: { TEST_API_KEY: 'test-key-123' }
        }
      }
    });

    mockEnvVars({
      APP_CONFIG_PATH: getFixturePath('test-config.json'),
      ABSTRACT_PROXY_SERVERS: 'test-server'
    });

    fsMocks.readFile.mockResolvedValue(configContent);
    fsMocks.mkdir.mockResolvedValue(undefined);

    // Import and run the main function
    await import('../../src/abstract.js');

    // Verify server was created
    expect(McpServer).toHaveBeenCalledWith({
      name: "abstract",
      version: "0.1.0"
    });

    // Verify both tools were registered
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    
    // Check first tool registration (call_tool_and_store)
    const firstCall = mockServer.registerTool.mock.calls[0];
    expect(firstCall[0]).toBe("call_tool_and_store");
    expect(firstCall[1]).toMatchObject({
      title: "Call Tool and Store",
      description: expect.stringContaining("Calls any upstream MCP tool"),
      inputSchema: expect.any(Object)
    });
    expect(firstCall[2]).toBeTypeOf('function');

    // Check second tool registration (list_available_tools)
    const secondCall = mockServer.registerTool.mock.calls[1];
    expect(secondCall[0]).toBe("list_available_tools");
    expect(secondCall[1]).toMatchObject({
      title: "List Available Tools",
      description: expect.stringContaining("Lists all available tools"),
      inputSchema: {}
    });
    expect(secondCall[2]).toBeTypeOf('function');

    // Verify server connection
    expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);

    // Verify cache directory creation
    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('cache'),
      { recursive: true }
    );
  });

  it('should verify tool registration structure', () => {
    // This test verifies the tools were registered with correct structure
    expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
    
    const calls = mockServer.registerTool.mock.calls;
    
    // Verify call_tool_and_store tool
    expect(calls[0][0]).toBe("call_tool_and_store");
    expect(calls[0][1].inputSchema).toHaveProperty('tool_name');
    expect(calls[0][1].inputSchema).toHaveProperty('tool_args');
    expect(calls[0][1].inputSchema).toHaveProperty('description');
    
    // Verify list_available_tools tool
    expect(calls[1][0]).toBe("list_available_tools");
    expect(calls[1][1].inputSchema).toEqual({});
  });
});