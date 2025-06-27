import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callUpstreamTool } from '../../src/core.js';

// Mock the core function
vi.mock('../../src/core.js', () => ({
  callUpstreamTool: vi.fn()
}));

describe('call_tool handler functionality', () => {
  const mockCallUpstreamTool = vi.mocked(callUpstreamTool);
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Create a mock call_tool handler that mimics the actual implementation
  const createCallToolHandler = () => {
    return async ({ server, tool_name, tool_args = {} }: { server: string, tool_name: string, tool_args?: any }) => {
      try {
        // This mimics the logic in src/abstract.ts call_tool handler
        const upstreamResponse = await callUpstreamTool(server, tool_name, tool_args, new Map());
        
        // Return raw response directly (no caching, no file storage)
        return upstreamResponse;
        
      } catch (error) {
        // Return proper error response if upstream call fails
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to call upstream tool: ${errorMessage}`);
        
        return {
          content: [
            {
              type: "text",  
              text: `Error calling ${server}:${tool_name}: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    };
  };

  it('should return raw response from upstream tool', async () => {
    // Mock successful upstream response
    const mockResponse = {
      content: [{
        type: "text",
        text: "Bitcoin price: $45,000"
      }]
    };
    
    mockCallUpstreamTool.mockResolvedValue(mockResponse);
    
    // Test the call_tool handler logic
    const callToolHandler = createCallToolHandler();
    const result = await callToolHandler({
      server: "crypto-mcp",
      tool_name: "get_bitcoin_price",
      tool_args: {}
    });
    
    expect(result).toEqual(mockResponse);
    expect(mockCallUpstreamTool).toHaveBeenCalledWith("crypto-mcp", "get_bitcoin_price", {}, new Map());
  });

  it('should handle upstream tool errors gracefully and return proper error format', async () => {
    // Mock upstream error
    const mockError = new Error('Server unavailable');
    mockCallUpstreamTool.mockRejectedValue(mockError);
    
    // Spy on console.error to verify error logging
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const callToolHandler = createCallToolHandler();
    const result = await callToolHandler({
      server: "unavailable-server",
      tool_name: "test_tool",
      tool_args: {}
    });
    
    // Should return error response in proper format
    expect(result).toEqual({
      content: [
        {
          type: "text",  
          text: "Error calling unavailable-server:test_tool: Server unavailable"
        }
      ],
      isError: true
    });
    
    expect(mockCallUpstreamTool).toHaveBeenCalledWith("unavailable-server", "test_tool", {}, new Map());
    expect(consoleSpy).toHaveBeenCalledWith("Failed to call upstream tool: Server unavailable");
    
    consoleSpy.mockRestore();
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
    
    const callToolHandler = createCallToolHandler();
    const complexArgs = {
      symbols: ["BTC", "ETH"],
      currency: "USD",
      include_change: true
    };
    
    const result = await callToolHandler({
      server: "crypto-mcp",
      tool_name: "get_multiple_prices",
      tool_args: complexArgs
    });
    
    expect(result).toEqual(mockResponse);
    expect(mockCallUpstreamTool).toHaveBeenCalledWith("crypto-mcp", "get_multiple_prices", complexArgs, new Map());
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
    
    const callToolHandler = createCallToolHandler();
    const result = await callToolHandler({
      server: "health-mcp",
      tool_name: "status"
      // tool_args omitted to test default empty object
    });
    
    expect(result).toEqual(mockResponse);
    expect(mockCallUpstreamTool).toHaveBeenCalledWith("health-mcp", "status", {}, new Map());
  });

  it('should preserve response metadata and structure unchanged', async () => {
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
    
    const callToolHandler = createCallToolHandler();
    const result = await callToolHandler({
      server: "tavily-mcp",
      tool_name: "search",
      tool_args: { query: "AI news", max_results: 5 }
    });
    
    // call_tool should preserve all metadata unchanged
    expect(result).toEqual(mockResponse);
    expect(result.meta).toEqual({
      source: "tavily-search",
      timestamp: "2024-01-01T00:00:00Z", 
      result_count: 5
    });
  });

  it('should handle non-Error exceptions properly', async () => {
    // Mock upstream rejection with non-Error object
    mockCallUpstreamTool.mockRejectedValue("String error message");
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const callToolHandler = createCallToolHandler();
    const result = await callToolHandler({
      server: "failing-server",
      tool_name: "failing_tool",
      tool_args: {}
    });
    
    expect(result).toEqual({
      content: [
        {
          type: "text",  
          text: "Error calling failing-server:failing_tool: String error message"
        }
      ],
      isError: true
    });
    
    expect(consoleSpy).toHaveBeenCalledWith("Failed to call upstream tool: String error message");
    consoleSpy.mockRestore();
  });
});