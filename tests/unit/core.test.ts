import { describe, it, expect, vi } from 'vitest';
import { 
  createCacheData, 
  generateCacheFilePath, 
  createResourceLink 
} from '../../src/core.js';
import path from 'node:path';

describe('createCacheData', () => {
  it('should create cache data with all fields', () => {
    const toolName = 'test-server:search';
    const toolArgs = { query: 'test' };
    const response = { results: ['item1', 'item2'] };
    const description = 'Test search results';

    const result = createCacheData(toolName, toolArgs, response, description);

    expect(result).toEqual({
      tool_name: toolName,
      tool_args: toolArgs,
      response: response,
      description: description,
      timestamp: expect.any(String),
      type: "upstream_tool_response"
    });

    // Verify timestamp is a valid ISO string
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should create cache data with default description', () => {
    const toolName = 'test-server:search';
    const toolArgs = { query: 'test' };
    const response = { results: [] };

    const result = createCacheData(toolName, toolArgs, response);

    expect(result.description).toBe('Response from test-server:search');
  });
});

describe('generateCacheFilePath', () => {
  it('should generate a file path with UUID and .json extension', () => {
    const cacheDir = '/test/cache';
    
    const result = generateCacheFilePath(cacheDir);
    
    expect(result).toMatch(/^\/test\/cache\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/);
  });

  it('should generate different paths on multiple calls', () => {
    const cacheDir = '/test/cache';
    
    const result1 = generateCacheFilePath(cacheDir);
    const result2 = generateCacheFilePath(cacheDir);
    
    expect(result1).not.toBe(result2);
  });
});

describe('createResourceLink', () => {
  it('should create a valid resource link', () => {
    const filePath = '/test/cache/file.json';
    const data = { test: 'data' };
    const description = 'Test data';

    const result = createResourceLink(filePath, data, description);

    expect(result).toEqual({
      "@type": "resourceLink",
      uri: `file://${filePath}`,
      bytes: Buffer.byteLength(JSON.stringify(data)),
      description: description
    });
  });

  it('should create resource link with default description', () => {
    const filePath = '/test/cache/file.json';
    const data = { test: 'data' };

    const result = createResourceLink(filePath, data);

    expect(result.description).toBe('Cached tool response');
  });

  it('should calculate correct byte length for complex data', () => {
    const filePath = '/test/cache/file.json';
    const data = { 
      items: ['item1', 'item2', 'item3'],
      metadata: {
        total: 3,
        timestamp: '2024-01-01T00:00:00Z'
      }
    };

    const result = createResourceLink(filePath, data);

    const expectedBytes = Buffer.byteLength(JSON.stringify(data));
    expect(result.bytes).toBe(expectedBytes);
  });
});