import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callUpstreamTool, listAvailableTools, getToolDetails } from '../../src/core.js';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/client/index.js");
vi.mock("@modelcontextprotocol/sdk/client/stdio.js");

describe('callUpstreamTool', () => {
  const mockClient = {
    connect: vi.fn(),
    request: vi.fn(),
    close: vi.fn()
  };

  const mockTransport = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Client).mockImplementation(() => mockClient as any);
    vi.mocked(StdioClientTransport).mockImplementation(() => mockTransport as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully call upstream tool', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js'],
        env: { API_KEY: 'test-key' }
      }]
    ]);

    const expectedResponse = { content: [{ type: 'text', text: 'test response' }] };
    mockClient.request.mockResolvedValue(expectedResponse);

    const result = await callUpstreamTool('test-server', 'search', { query: 'test' }, upstreamConfigs);

    expect(Client).toHaveBeenCalledWith({
      name: "abstract-proxy-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });

    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: 'node',
      args: ['/path/to/server.js'],
      env: expect.objectContaining({ API_KEY: 'test-key' })
    });

    expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { query: 'test' }
      }
    }, expect.any(Object));
    expect(mockClient.close).toHaveBeenCalled();
    expect(result).toBe(expectedResponse);
  });

  it('should throw error for unknown server', async () => {
    const upstreamConfigs = new Map();

    await expect(callUpstreamTool('unknown-server', 'search', {}, upstreamConfigs))
      .rejects.toThrow('Unknown upstream server: unknown-server. Available servers: ');
  });

  it('should handle valid server and tool name', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const expectedResponse = { content: [{ type: 'text', text: 'test response' }] };
    mockClient.request.mockResolvedValue(expectedResponse);

    const result = await callUpstreamTool('test-server', 'search', { query: 'test' }, upstreamConfigs);

    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { query: 'test' }
      }
    }, expect.any(Object));
    expect(result).toBe(expectedResponse);
  });

  it('should close client even if request fails', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const error = new Error('Connection failed');
    mockClient.request.mockRejectedValue(error);

    await expect(callUpstreamTool('test-server', 'search', {}, upstreamConfigs))
      .rejects.toThrow('Connection failed');

    expect(mockClient.close).toHaveBeenCalled();
  });

  it('should merge environment variables correctly', async () => {
    const originalEnv = process.env.EXISTING_VAR;
    process.env.EXISTING_VAR = 'original-value';

    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js'],
        env: { 
          NEW_VAR: 'new-value',
          EXISTING_VAR: 'overridden-value'
        }
      }]
    ]);

    mockClient.request.mockResolvedValue({ content: [] });

    await callUpstreamTool('test-server', 'search', {}, upstreamConfigs);

    expect(StdioClientTransport).toHaveBeenCalledWith({
      command: 'node',
      args: ['/path/to/server.js'],
      env: expect.objectContaining({
        EXISTING_VAR: 'overridden-value',
        NEW_VAR: 'new-value'
      })
    });

    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.EXISTING_VAR = originalEnv;
    } else {
      delete process.env.EXISTING_VAR;
    }
  });
});

describe('listAvailableTools', () => {
  const mockClient = {
    connect: vi.fn(),
    request: vi.fn(),
    close: vi.fn()
  };

  const mockTransport = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Client).mockImplementation(() => mockClient as any);
    vi.mocked(StdioClientTransport).mockImplementation(() => mockTransport as any);
  });

  it('should return structured tool information', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const mockToolsList = {
      tools: [
        {
          name: 'search',
          description: 'Perform a web search',
          inputSchema: { query: { type: 'string' } }
        },
        {
          name: 'upload',
          description: 'Upload a file'
        }
      ]
    };

    mockClient.request.mockResolvedValue(mockToolsList);

    const result = await listAvailableTools(upstreamConfigs);

    expect(result).toEqual([
      {
        server: 'test-server',
        tool: 'search',
        description: 'Perform a web search'
      },
      {
        server: 'test-server',
        tool: 'upload',
        description: 'Upload a file'
      }
    ]);

    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.close).toHaveBeenCalled();
  });

  it('should include input schemas when detailed=true', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const mockToolsList = {
      tools: [
        {
          name: 'search',
          description: 'Perform a web search',
          inputSchema: { query: { type: 'string' } }
        }
      ]
    };

    mockClient.request.mockResolvedValue(mockToolsList);

    const result = await listAvailableTools(upstreamConfigs, { detailed: true });

    expect(result).toEqual([
      {
        server: 'test-server',
        tool: 'search',
        description: 'Perform a web search',
        inputSchema: { query: { type: 'string' } }
      }
    ]);
  });

  it('should filter by server when specified', async () => {
    const upstreamConfigs = new Map([
      ['server1', { command: 'node', args: ['/path1.js'] }],
      ['server2', { command: 'node', args: ['/path2.js'] }]
    ]);

    const mockToolsList = {
      tools: [
        { name: 'tool1', description: 'Tool 1' }
      ]
    };

    mockClient.request.mockResolvedValue(mockToolsList);

    const result = await listAvailableTools(upstreamConfigs, { filterByServer: 'server1' });

    expect(result).toEqual([
      {
        server: 'server1',
        tool: 'tool1',
        description: 'Tool 1'
      }
    ]);

    // Should only call server1, not server2
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });

  it('should handle server connection errors gracefully', async () => {
    const upstreamConfigs = new Map([
      ['failing-server', { command: 'node', args: ['/path.js'] }]
    ]);

    // Mock connect to fail immediately
    mockClient.connect.mockRejectedValue(new Error('Connection failed'));

    const result = await listAvailableTools(upstreamConfigs);

    expect(result).toEqual([
      {
        server: 'failing-server',
        tool: 'ERROR',
        description: 'Error connecting: Connection failed'
      }
    ]);

    // Since connect failed, close might not be called
    expect(mockClient.connect).toHaveBeenCalled();
  });
});

describe('getToolDetails', () => {
  const mockClient = {
    connect: vi.fn(),
    request: vi.fn(),
    close: vi.fn()
  };

  const mockTransport = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Client).mockImplementation(() => mockClient as any);
    vi.mocked(StdioClientTransport).mockImplementation(() => mockTransport as any);
  });

  it('should return detailed tool information', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const mockToolsList = {
      tools: [
        {
          name: 'search',
          description: 'Perform a web search',
          inputSchema: { query: { type: 'string' } }
        }
      ]
    };

    mockClient.request.mockResolvedValue(mockToolsList);

    const result = await getToolDetails('test-server', 'search', upstreamConfigs);

    expect(result).toEqual({
      server: 'test-server',
      tool: 'search',
      description: 'Perform a web search',
      inputSchema: { query: { type: 'string' } }
    });
  });

  it('should return null for non-existent tool', async () => {
    const upstreamConfigs = new Map([
      ['test-server', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const mockToolsList = {
      tools: [
        { name: 'other-tool', description: 'Other tool' }
      ]
    };

    mockClient.request.mockResolvedValue(mockToolsList);

    const result = await getToolDetails('test-server', 'search', upstreamConfigs);

    expect(result).toBeNull();
  });

  it('should throw error for unknown server', async () => {
    const upstreamConfigs = new Map();

    await expect(getToolDetails('unknown-server', 'search', upstreamConfigs))
      .rejects.toThrow('Unknown upstream server: unknown-server');
  });
});