import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockEnvVars, getFixturePath, createFsMocks } from '../helpers/test-utils.js';
import fs from 'node:fs/promises';

// Mock fs module
vi.mock('node:fs/promises');

describe('loadUpstreamConfigs', () => {
  const fsMocks = createFsMocks();
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup fs mocks
    Object.assign(fs, fsMocks);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return empty map when APP_CONFIG_PATH is not set', async () => {
    // We need to import the function after mocking
    const { loadUpstreamConfigs } = await import('../../src/core.js');
    
    const result = await loadUpstreamConfigs();
    expect(result.size).toBe(0);
  });

  it('should return empty map when ABSTRACT_PROXY_SERVERS is not set', async () => {
    mockEnvVars({
      APP_CONFIG_PATH: '/fake/config.json'
    });

    const { loadUpstreamConfigs } = await import('../../src/core.js');
    
    const result = await loadUpstreamConfigs();
    expect(result.size).toBe(0);
  });

  it('should load configurations successfully', async () => {
    const configPath = getFixturePath('test-config.json');
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
      APP_CONFIG_PATH: configPath,
      ABSTRACT_PROXY_SERVERS: 'test-server'
    });

    fsMocks.readFile.mockResolvedValue(configContent);

    const { loadUpstreamConfigs } = await import('../../src/core.js');
    
    const result = await loadUpstreamConfigs();
    expect(result.size).toBe(1);
    expect(result.has('test-server')).toBe(true);
    expect(result.get('test-server')).toEqual({
      command: 'node',
      args: ['/fake/path/server.js'],
      env: { TEST_API_KEY: 'test-key-123' }
    });
  });

  it('should handle missing servers in config', async () => {
    const configPath = getFixturePath('test-config.json');
    const configContent = JSON.stringify({
      mcpServers: {
        'existing-server': {
          command: 'node',
          args: ['/fake/path/server.js']
        }
      }
    });

    mockEnvVars({
      APP_CONFIG_PATH: configPath,
      ABSTRACT_PROXY_SERVERS: 'missing-server,existing-server'
    });

    fsMocks.readFile.mockResolvedValue(configContent);

    const { loadUpstreamConfigs } = await import('../../src/core.js');
    
    const result = await loadUpstreamConfigs();
    expect(result.size).toBe(1);
    expect(result.has('existing-server')).toBe(true);
    expect(result.has('missing-server')).toBe(false);
  });

  it('should handle file read errors gracefully', async () => {
    mockEnvVars({
      APP_CONFIG_PATH: '/nonexistent/config.json',
      ABSTRACT_PROXY_SERVERS: 'test-server'
    });

    fsMocks.readFile.mockRejectedValue(new Error('File not found'));

    const { loadUpstreamConfigs } = await import('../../src/core.js');
    
    const result = await loadUpstreamConfigs();
    expect(result.size).toBe(0);
  });

  it('should handle invalid JSON gracefully', async () => {
    mockEnvVars({
      APP_CONFIG_PATH: '/fake/config.json',
      ABSTRACT_PROXY_SERVERS: 'test-server'
    });

    fsMocks.readFile.mockResolvedValue('invalid json');

    const { loadUpstreamConfigs } = await import('../../src/core.js');
    
    const result = await loadUpstreamConfigs();
    expect(result.size).toBe(0);
  });
});