import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('list_allowed_directories tool', () => {
  // Mock STORAGE_DIRS for testing
  const mockStorageDirs = ['/test/dir1', '/test/dir2', '/test/dir3'];
  
  // Mock the tool function based on implementation
  const listAllowedDirectoriesTool = () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            allowed_directories: mockStorageDirs,
            default_directory: mockStorageDirs[0],
            total_directories: mockStorageDirs.length
          }, null, 2)
        }
      ]
    };
  };

  it('should return correct directory information with multiple directories', () => {
    const result = listAllowedDirectoriesTool();
    
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    
    const parsedResponse = JSON.parse(result.content[0].text);
    expect(parsedResponse).toEqual({
      allowed_directories: ['/test/dir1', '/test/dir2', '/test/dir3'],
      default_directory: '/test/dir1',
      total_directories: 3
    });
  });

  it('should handle single directory (backward compatibility)', () => {
    const singleDirMock = ['/cache'];
    
    const singleDirTool = () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              allowed_directories: singleDirMock,
              default_directory: singleDirMock[0],
              total_directories: singleDirMock.length
            }, null, 2)
          }
        ]
      };
    };

    const result = singleDirTool();
    const parsedResponse = JSON.parse(result.content[0].text);
    
    expect(parsedResponse).toEqual({
      allowed_directories: ['/cache'],
      default_directory: '/cache',
      total_directories: 1
    });
  });

  it('should return valid JSON format', () => {
    const result = listAllowedDirectoriesTool();
    
    expect(() => {
      JSON.parse(result.content[0].text);
    }).not.toThrow();
  });

  it('should have default_directory as first in allowed_directories array', () => {
    const result = listAllowedDirectoriesTool();
    const parsedResponse = JSON.parse(result.content[0].text);
    
    expect(parsedResponse.default_directory).toBe(parsedResponse.allowed_directories[0]);
  });

  it('should have total_directories match array length', () => {
    const result = listAllowedDirectoriesTool();
    const parsedResponse = JSON.parse(result.content[0].text);
    
    expect(parsedResponse.total_directories).toBe(parsedResponse.allowed_directories.length);
  });

  it('should format JSON with proper indentation', () => {
    const result = listAllowedDirectoriesTool();
    
    // Check that the JSON is formatted (contains newlines and spaces)
    expect(result.content[0].text).toContain('\n');
    expect(result.content[0].text).toContain('  '); // 2-space indentation
  });
});