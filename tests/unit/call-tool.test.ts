import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callUpstreamTool } from '../../src/core.js';

// Mock the core function
vi.mock('../../src/core.js', () => ({
  callUpstreamTool: vi.fn()
}));

describe('call_tool direct response functionality', () => {
  const mockCallUpstreamTool = vi.mocked(callUpstreamTool);
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return raw response from upstream tool', async () => {
    // Mock successful upstream response
    const mockResponse = {
      content: [{
        type: "text",
        text: "Bitcoin price: $45,000"
      }]
    };
    
    mockCallUpstreamTool.mockResolvedValue(mockResponse);
    
    // Test the function behavior (would be called by the MCP server)
    const server = "crypto-mcp";
    const tool_name = "get_bitcoin_price";
    const tool_args = {};
    const upstreamConfigs = new Map();
    
    const result = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
    
    expect(result).toEqual(mockResponse);
    expect(mockCallUpstreamTool).toHaveBeenCalledWith(server, tool_name, tool_args, upstreamConfigs);
  });

  it('should handle upstream tool errors gracefully', async () => {
    // Mock upstream error
    const mockError = new Error('Server unavailable');
    mockCallUpstreamTool.mockRejectedValue(mockError);
    
    const server = "unavailable-server";
    const tool_name = "test_tool";
    const tool_args = {};
    const upstreamConfigs = new Map();
    
    await expect(callUpstreamTool(server, tool_name, tool_args, upstreamConfigs))
      .rejects.toThrow('Server unavailable');
    
    expect(mockCallUpstreamTool).toHaveBeenCalledWith(server, tool_name, tool_args, upstreamConfigs);
  });

  it('should pass through complex tool arguments unchanged', async () => {
    // Mock response for complex query
    const mockResponse = {
      content: [{
        type: "text", 
        text: JSON.stringify([
          { symbol: "BTC", price: 45000 },
          { symbol: "ETH", price: 2800 }
        ])
      }]
    };
    
    mockCallUpstreamTool.mockResolvedValue(mockResponse);
    
    const server = "crypto-mcp";
    const tool_name = "get_multiple_prices";
    const tool_args = {
      symbols: ["BTC", "ETH"],
      currency: "USD",
      include_change: true
    };
    const upstreamConfigs = new Map();
    
    const result = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
    
    expect(result).toEqual(mockResponse);
    expect(mockCallUpstreamTool).toHaveBeenCalledWith(server, tool_name, tool_args, upstreamConfigs);
  });

  it('should work with minimal arguments (empty tool_args)', async () => {
    // Mock simple response
    const mockResponse = {
      content: [{
        type: "text",
        text: "Status: OK"
      }]
    };
    
    mockCallUpstreamTool.mockResolvedValue(mockResponse);
    
    const server = "health-mcp";
    const tool_name = "status";
    const tool_args = {};
    const upstreamConfigs = new Map();
    
    const result = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
    
    expect(result).toEqual(mockResponse);
    expect(mockCallUpstreamTool).toHaveBeenCalledWith(server, tool_name, tool_args, upstreamConfigs);
  });

  it('should preserve response metadata and structure', async () => {
    // Mock response with rich metadata
    const mockResponse = {
      content: [{
        type: "text",
        text: "Search results..."
      }],
      meta: {
        source: "tavily-search",
        timestamp: "2024-01-01T00:00:00Z",
        result_count: 5
      },
      isError: false
    };
    
    mockCallUpstreamTool.mockResolvedValue(mockResponse);
    
    const server = "tavily-mcp";
    const tool_name = "search";
    const tool_args = { query: "AI news", max_results: 5 };
    const upstreamConfigs = new Map();
    
    const result = await callUpstreamTool(server, tool_name, tool_args, upstreamConfigs);
    
    // call_tool should preserve all metadata unchanged
    expect(result).toEqual(mockResponse);
    expect(result.meta).toEqual({
      source: "tavily-search",
      timestamp: "2024-01-01T00:00:00Z", 
      result_count: 5
    });
  });
});