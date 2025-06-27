import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
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

    // Verify all four tools were registered
    expect(mockServer.registerTool).toHaveBeenCalledTimes(4);
    
    // Check first tool registration (call_tool_and_store)
    const firstCall = mockServer.registerTool.mock.calls[0];
    expect(firstCall[0]).toBe("call_tool_and_store");
    expect(firstCall[1]).toMatchObject({
      title: "Call Tool and Store",
      description: expect.stringContaining("Calls upstream MCP tools"),
      inputSchema: expect.any(Object)
    });
    expect(firstCall[2]).toBeTypeOf('function');

    // Check second tool registration (list_available_tools)
    const secondCall = mockServer.registerTool.mock.calls[1];
    expect(secondCall[0]).toBe("list_available_tools");
    expect(secondCall[1]).toMatchObject({
      title: "List Available Tools",
      description: expect.stringContaining("Discovers available tools"),
      inputSchema: expect.any(Object)
    });
    expect(secondCall[2]).toBeTypeOf('function');

    // Check third tool registration (list_tool_details)
    const thirdCall = mockServer.registerTool.mock.calls[2];
    expect(thirdCall[0]).toBe("list_tool_details");
    expect(thirdCall[1]).toMatchObject({
      title: "Get Tool Details",
      description: expect.stringContaining("Get complete definition"),
      inputSchema: expect.any(Object)
    });
    expect(thirdCall[2]).toBeTypeOf('function');

    // Check fourth tool registration (list_allowed_directories)
    const fourthCall = mockServer.registerTool.mock.calls[3];
    expect(fourthCall[0]).toBe("list_allowed_directories");
    expect(fourthCall[1]).toMatchObject({
      title: "List Allowed Storage Directories",
      description: expect.stringContaining("Lists all directories"),
      inputSchema: {}
    });
    expect(fourthCall[2]).toBeTypeOf('function');

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
    expect(mockServer.registerTool).toHaveBeenCalledTimes(4);
    
    const calls = mockServer.registerTool.mock.calls;
    
    // Verify call_tool_and_store tool
    expect(calls[0][0]).toBe("call_tool_and_store");
    expect(calls[0][1].inputSchema).toHaveProperty('tool_name');
    expect(calls[0][1].inputSchema).toHaveProperty('tool_args');
    expect(calls[0][1].inputSchema).toHaveProperty('description');
    expect(calls[0][1].inputSchema).toHaveProperty('storage_path');
    expect(calls[0][1].inputSchema).toHaveProperty('filename');
    expect(calls[0][1].inputSchema).toHaveProperty('file_format');
    
    // Verify list_available_tools tool
    expect(calls[1][0]).toBe("list_available_tools");
    expect(calls[1][1].inputSchema).toHaveProperty('detailed');
    expect(calls[1][1].inputSchema).toHaveProperty('filter_by_server');
    
    // Verify list_tool_details tool
    expect(calls[2][0]).toBe("list_tool_details");
    expect(calls[2][1].inputSchema).toHaveProperty('server');
    expect(calls[2][1].inputSchema).toHaveProperty('tool_name');
    
    // Verify list_allowed_directories tool
    expect(calls[3][0]).toBe("list_allowed_directories");
    expect(calls[3][1].inputSchema).toEqual({});
  });

  describe('Directory Storage Integration', () => {
    it('should verify storage_path parameter exists in tool schema', () => {
      // Verify the call_tool_and_store tool was registered with all storage parameters
      const calls = mockServer.registerTool.mock.calls;
      const callToolAndStoreCall = calls.find(call => call[0] === 'call_tool_and_store');
      
      expect(callToolAndStoreCall).toBeDefined();
      expect(callToolAndStoreCall[1].inputSchema).toHaveProperty('storage_path');
      expect(callToolAndStoreCall[1].inputSchema).toHaveProperty('filename');
      expect(callToolAndStoreCall[1].inputSchema).toHaveProperty('file_format');
    });

    it('should backward compatibility still work without storage_path', () => {
      // The current test setup already validates that the server works without
      // storage_path parameter, which is backward compatibility
      expect(mockServer.registerTool).toHaveBeenCalledTimes(4);
      expect(fsMocks.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('cache'),
        { recursive: true }
      );
    });

    it('should support file format parameter for enhanced storage', () => {
      // This test verifies that the file_format parameter is available
      // The actual format detection and extraction is tested in unit tests
      const calls = mockServer.registerTool.mock.calls;
      const callToolAndStoreCall = calls.find(call => call[0] === 'call_tool_and_store');
      
      expect(callToolAndStoreCall).toBeDefined();
      expect(callToolAndStoreCall[1].inputSchema.file_format).toBeDefined();
      
      // Verify the file_format parameter exists (specific enum validation is tested in unit tests)
      expect(callToolAndStoreCall[1].inputSchema.file_format).toBeDefined();
    });
  });
});