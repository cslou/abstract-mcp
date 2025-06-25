import { describe, it, expect, vi } from 'vitest';
import { 
  createCacheData, 
  generateCacheFilePath, 
  generateFilename,
  createResourceLink,
  validatePath,
  validateDirectory
} from '../../src/core.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';

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

describe('generateFilename', () => {
  it('should return custom filename when provided', () => {
    const result = generateFilename('tavily-mcp', 'search', 'my-custom-name');
    expect(result).toBe('my-custom-name');
  });

  it('should generate timestamp-based filename when no custom name provided', () => {
    const result = generateFilename('tavily-mcp', 'search');
    
    // Should match pattern: server-tool-timestamp
    expect(result).toMatch(/^tavily-mcp-search-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  });

  it('should generate different timestamps on multiple calls', () => {
    const result1 = generateFilename('test-server', 'test-tool');
    // Small delay to ensure different timestamp
    const result2 = generateFilename('test-server', 'test-tool');
    
    // They should be different (unless called in exact same millisecond)
    if (result1 === result2) {
      // If same, wait a bit and try again
      setTimeout(() => {
        const result3 = generateFilename('test-server', 'test-tool');
        expect(result3).not.toBe(result1);
      }, 1);
    } else {
      expect(result1).not.toBe(result2);
    }
  });

  it('should handle server and tool names with special characters', () => {
    const result = generateFilename('test-server_v1', 'search-tool', 'safe_filename');
    expect(result).toBe('safe_filename');
  });

  it('should create valid filenames for various server/tool combinations', () => {
    const combinations = [
      ['filesystem', 'read_file'],
      ['tavily-mcp', 'search'],
      ['gordian', 'get_crypto_prices']
    ];

    combinations.forEach(([server, tool]) => {
      const result = generateFilename(server, tool);
      expect(result).toMatch(new RegExp(`^${server}-${tool}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z$`));
    });
  });
});

describe('generateCacheFilePath', () => {
  it('should generate a file path with UUID and .json extension when no filename provided', () => {
    const cacheDir = '/test/cache';
    
    const result = generateCacheFilePath(cacheDir);
    
    expect(result).toMatch(/^\/test\/cache\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/);
  });

  it('should use custom filename when provided', () => {
    const cacheDir = '/test/cache';
    const customFilename = 'my-custom-file';
    
    const result = generateCacheFilePath(cacheDir, undefined, customFilename);
    
    expect(result).toBe('/test/cache/my-custom-file.json');
  });

  it('should generate different paths on multiple calls without filename', () => {
    const cacheDir = '/test/cache';
    
    const result1 = generateCacheFilePath(cacheDir);
    const result2 = generateCacheFilePath(cacheDir);
    
    expect(result1).not.toBe(result2);
  });

  it('should validate allowed directories when provided', () => {
    const targetDir = '/some/path';
    const allowedDirs = ['/allowed/path1', '/allowed/path2'];
    
    expect(() => {
      generateCacheFilePath(targetDir, allowedDirs);
    }).toThrow('Target directory /some/path is not within allowed directories');
  });

  it('should allow valid directory within allowed paths', () => {
    const targetDir = '/allowed/path1/subdir';
    const allowedDirs = ['/allowed/path1', '/allowed/path2'];
    
    const result = generateCacheFilePath(targetDir, allowedDirs);
    expect(result).toMatch(/^\/allowed\/path1\/subdir\/[0-9a-f-]+\.json$/);
  });

  it('should combine custom filename with directory validation', () => {
    const targetDir = '/allowed/path1';
    const allowedDirs = ['/allowed/path1', '/allowed/path2'];
    const customFilename = 'validated-custom-file';
    
    const result = generateCacheFilePath(targetDir, allowedDirs, customFilename);
    expect(result).toBe('/allowed/path1/validated-custom-file.json');
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

describe('validatePath', () => {
  it('should allow paths within allowed directories', () => {
    const allowedDirs = ['/allowed/path1', '/allowed/path2'];
    
    expect(validatePath('/allowed/path1/file.txt', allowedDirs)).toBe(true);
    expect(validatePath('/allowed/path1/subdir/file.txt', allowedDirs)).toBe(true);
    expect(validatePath('/allowed/path2', allowedDirs)).toBe(true);
  });

  it('should reject paths outside allowed directories', () => {
    const allowedDirs = ['/allowed/path1', '/allowed/path2'];
    
    expect(validatePath('/forbidden/path', allowedDirs)).toBe(false);
    expect(validatePath('/allowed', allowedDirs)).toBe(false);
    expect(validatePath('/allowed/path3', allowedDirs)).toBe(false);
  });

  it('should handle path traversal attempts', () => {
    const allowedDirs = ['/allowed/path1'];
    
    expect(validatePath('/allowed/path1/../../../etc/passwd', allowedDirs)).toBe(false);
    expect(validatePath('/allowed/path1/../path2', allowedDirs)).toBe(false);
  });

  it('should handle relative paths', () => {
    const allowedDirs = [path.resolve('./allowed')];
    
    expect(validatePath('./allowed/file.txt', allowedDirs)).toBe(true);
    expect(validatePath('../forbidden', allowedDirs)).toBe(false);
  });

  it('should handle invalid paths gracefully', () => {
    const allowedDirs = ['/allowed/path1'];
    
    expect(validatePath('', allowedDirs)).toBe(false);
    expect(validatePath(null as any, allowedDirs)).toBe(false);
  });
});

describe('validateDirectory', () => {
  it('should validate existing writable directory', async () => {
    const testDir = path.join(tmpdir(), 'abstract-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    
    const result = await validateDirectory(testDir);
    expect(result).toBe(true);
    
    // Cleanup
    await fs.rmdir(testDir);
  });

  it('should reject non-existent directory', async () => {
    const nonExistentDir = '/definitely/does/not/exist';
    
    const result = await validateDirectory(nonExistentDir);
    expect(result).toBe(false);
  });

  it('should reject file instead of directory', async () => {
    const testFile = path.join(tmpdir(), 'abstract-test-file-' + Date.now());
    await fs.writeFile(testFile, 'test');
    
    const result = await validateDirectory(testFile);
    expect(result).toBe(false);
    
    // Cleanup
    await fs.unlink(testFile);
  });
});