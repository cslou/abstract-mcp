import { vi } from 'vitest';
import path from 'node:path';

// Mock environment variables
export function mockEnvVars(vars: Record<string, string>) {
  Object.entries(vars).forEach(([key, value]) => {
    vi.stubEnv(key, value);
  });
}

// Get test fixtures path
export function getFixturePath(filename: string): string {
  return path.resolve(process.cwd(), 'tests', 'fixtures', filename);
}

// Mock file system operations
export function createFsMocks() {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  };
}

// Mock MCP client
export function createMcpClientMock() {
  return {
    connect: vi.fn(),
    request: vi.fn(),
    close: vi.fn(),
  };
}

// Create a test cache directory path
export function getTestCacheDir(): string {
  return path.resolve(process.cwd(), 'tests', 'fixtures', 'cache');
}