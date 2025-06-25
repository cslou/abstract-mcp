import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callUpstreamTool } from '../../src/core.js';
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

    const result = await callUpstreamTool('test-server:search', { query: 'test' }, upstreamConfigs);

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

    await expect(callUpstreamTool('unknown-server:search', {}, upstreamConfigs))
      .rejects.toThrow('Unknown upstream server: unknown-server. Available servers: ');
  });

  it('should handle tool name without server prefix', async () => {
    const upstreamConfigs = new Map([
      ['unknown', {
        command: 'node',
        args: ['/path/to/server.js']
      }]
    ]);

    const expectedResponse = { content: [{ type: 'text', text: 'test response' }] };
    mockClient.request.mockResolvedValue(expectedResponse);

    const result = await callUpstreamTool('search', { query: 'test' }, upstreamConfigs);

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

    await expect(callUpstreamTool('test-server:search', {}, upstreamConfigs))
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

    await callUpstreamTool('test-server:search', {}, upstreamConfigs);

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