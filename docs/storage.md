# Storage Strategy: Moving from Cache to User-Specified Directories

## Current State Analysis

### Current Cache-Based Approach
The abstract MCP server currently stores all tool responses in a fixed `cache/` directory with:
- UUID-based filenames (`<uuid>.json`)
- Metadata wrapper including `tool_name`, `tool_args`, `response`, `description`, `timestamp`, `type`
- Returns resource links with `file://` URIs pointing to cached files

### Problems with Current Approach
1. **Fixed Location**: Cache directory is hardcoded relative to server location
2. **Metadata Bloat**: Each response includes extensive metadata alongside actual content
3. **No User Control**: Users cannot specify where content should be stored
4. **Non-Intuitive Organization**: UUID filenames provide no semantic meaning
5. **Mixed Content Types**: All responses stored as JSON regardless of original format

## Proposed Solution: Directory-Based Storage

### Follow Filesystem MCP Pattern

The filesystem MCP server uses command-line arguments to specify allowed directories:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

### Abstract MCP Configuration Pattern

We should adopt a similar approach:

```json
{
  "mcpServers": {
    "abstract": {
      "command": "node",
      "args": [
        "dist/abstract.js",
        "/path/to/allowed/dir_one",
        "/path/to/allowed/dir_two"
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/mcp/client/config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,filesystem"
      }
    }
  }
}
```

## Implementation Plan

### 1. Command Line Arguments Processing

Update `src/abstract.ts` to accept directory arguments:

```typescript
// Parse allowed directories from command line args
const allowedDirs = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
if (allowedDirs.length === 0) {
  console.error('No storage directories specified. Usage: node abstract.js <dir1> [dir2] ...');
  process.exit(1);
}
```

### 2. Directory Validation and Security

Implement security checks similar to filesystem MCP:

```typescript
function validatePath(targetPath: string, allowedDirs: string[]): boolean {
  const resolved = path.resolve(targetPath);
  return allowedDirs.some(dir => {
    const allowedDir = path.resolve(dir);
    return resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir;
  });
}
```

### 3. Enhanced Tool Interface

Modify `call_tool_and_store` to accept storage parameters:

```typescript
server.registerTool(
  "call_tool_and_store",
  {
    inputSchema: {
      server: z.string(),
      tool_name: z.string(),
      tool_args: z.record(z.any()).optional(),
      description: z.string().optional(),
      // New storage parameters
      storage_path: z.string().optional().describe("Directory path for storing response (must be within allowed directories)"),
      filename: z.string().optional().describe("Custom filename (without extension). Defaults to <server>-<tool>-<timestamp>"),
      file_format: z.enum(["json", "txt", "md", "csv"]).optional().describe("Output format. Auto-detected from response content if not specified")
    }
  }
)
```

### 4. Directory Discovery Tool

Add a tool to list allowed storage directories (following filesystem MCP pattern):

```typescript
server.registerTool(
  "list_allowed_directories",
  {
    title: "List Allowed Storage Directories",
    description: "Lists all directories that Abstract is allowed to store responses in. These directories are specified via command line arguments when the server starts.",
    inputSchema: {}
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            allowed_directories: STORAGE_DIRS,
            default_directory: STORAGE_DIRS[0],
            total_directories: STORAGE_DIRS.length
          }, null, 2)
        }
      ]
    };
  }
);
```

### 5. Content-Aware Storage

Implement intelligent storage based on response content:

```typescript
function determineFileFormat(response: any, requestedFormat?: string): string {
  if (requestedFormat) return requestedFormat;
  
  // Auto-detect based on content
  if (typeof response === 'string') {
    if (response.includes('```') || response.includes('#')) return 'md';
    if (response.includes(',') && response.includes('\n')) return 'csv';
    return 'txt';
  }
  
  return 'json'; // Default for complex objects
}

function generateFilename(server: string, toolName: string, customName?: string): string {
  if (customName) return customName;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${server}-${toolName}-${timestamp}`;
}

function extractContent(response: any, format: string): string {
  switch (format) {
    case 'txt':
    case 'md':
      // Extract text content from response
      if (response.content && Array.isArray(response.content)) {
        return response.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join('\n');
      }
      return typeof response === 'string' ? response : JSON.stringify(response, null, 2);
    
    case 'csv':
      // Handle CSV extraction from structured data
      return convertToCSV(response);
    
    case 'json':
    default:
      return JSON.stringify(response, null, 2);
  }
}
```

### 6. Backward Compatibility

Maintain backward compatibility by:
- Defaulting to first allowed directory if no `storage_path` specified
- Falling back to current behavior if no directories configured
- Supporting legacy resource link format

## Configuration Migration Guide

### For Claude Desktop Users

Update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "abstract": {
      "command": "node",
      "args": [
        "/path/to/abstract/dist/abstract.js",
        "/path/to/allowed/dir_one",
        "/path/to/allowed/dir_two"
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/claude/desktop/config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,filesystem,weather"
      }
    }
  }
}
```

### For Cursor Users

Update your MCP configuration:

```json
{
  "mcpServers": {
    "abstract": {
      "command": "node", 
      "args": [
        "/path/to/abstract/dist/abstract.js",
        "/path/to/allowed/dir_one",
        "/path/to/allowed/dir_two"
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/cursor/config.json",
        "ABSTRACT_PROXY_SERVERS": "filesystem,web-search"
      }
    }
  }
}
```

## Benefits of New Approach

### 1. User Control
- Users specify exactly where content gets stored
- Multiple allowed directories for organization
- Custom filenames and formats

### 2. Content Organization
- Meaningful filenames instead of UUIDs
- Format-appropriate file extensions
- Directory-based organization

### 3. Reduced Bloat
- Store only response content, not metadata
- Smaller file sizes
- Format-appropriate storage (CSV for tabular data, MD for documentation, etc.)

### 4. Security
- Sandboxed to specified directories only
- Path validation prevents directory traversal
- Clear boundaries for file operations

### 5. Integration Friendly
- Files stored in user-accessible locations
- Standard formats for easy consumption by other tools
- No need to parse through metadata wrappers

## Implementation Phases

### Phase 1: Basic Directory Support
- [ ] Add command-line argument parsing
- [ ] Implement directory validation
- [ ] Update `call_tool_and_store` with `storage_path` parameter
- [ ] Add `list_allowed_directories` tool for directory discovery
- [ ] Maintain backward compatibility

### Phase 2: Enhanced Storage Options
- [ ] Add `filename` and `file_format` parameters
- [ ] Implement content-aware format detection
- [ ] Add content extraction for different formats

### Phase 3: Advanced Features
- [ ] Directory organization by server/tool
- [ ] Automatic cleanup of old files
- [ ] Storage quota management
- [ ] Compression for large responses

## Migration Strategy

### Step 1: Prepare New Implementation
- Implement directory-based storage alongside current cache system
- Add feature flag to toggle between approaches

### Step 2: Update Documentation
- Update README with new configuration examples
- Create migration guide for existing users

### Step 3: Gradual Rollout
- Default to current behavior if no directories specified
- Allow users to opt-in to new storage approach
- Monitor for issues and gather feedback

### Step 4: Full Migration
- Make directory-based storage the default
- Deprecate cache-based approach
- Remove legacy code after transition period

## Testing Requirements

### Unit Tests
- [ ] Directory validation functions
- [ ] Filename generation
- [ ] Content extraction for each format
- [ ] Path security checks

### Integration Tests
- [ ] End-to-end storage workflows
- [ ] Multiple directory configurations
- [ ] Error handling for invalid paths
- [ ] Backward compatibility scenarios

### Security Tests
- [ ] Directory traversal attempts
- [ ] Permission boundary validation
- [ ] File overwrite protection 