# call_tool_with_file_content Implementation

This document details the implementation of `call_tool_with_file_content`, a tool that enables MCP tools to accept structured data from files while keeping large datasets out of the LLM context window.

## Purpose & Design

**Problem**: Some MCP tools accept JSON input (database inserts, bulk API operations, data analysis), but passing large datasets through the LLM context is inefficient and expensive.

**Solution**: Read structured data from files, convert to JSON format, and inject into upstream MCP tool arguments.

**Workflow**: 
```
File (CSV/JSON/YAML/etc.) → Auto-detect Format → Convert to JSON → Merge with Args → Call MCP Tool
```

## Tool Interface

### Input Schema
```typescript
{
  server: string,              // Upstream MCP server name
  tool_name: string,           // Tool to call on the server
  file_path: string,           // Path to input file (must be in allowed directories)
  data_key?: string,           // Parameter name for file content in tool args
  tool_args?: object,          // Additional arguments to merge with file data
  output_format?: string,      // Output format for the response
  
  // Response handling (reuse existing logic)
  description?: string,        // Description for stored response
  storage_path?: string,       // Where to store response
  filename?: string,           // Custom response filename
  response_format?: string     // Format for response storage
}
```

### Parameter Examples
```typescript
// Simple case - file content becomes entire args
{
  server: "analytics-mcp",
  tool_name: "process_data", 
  file_path: "/path/to/data.csv"
}

// Complex case - inject file data with additional parameters
{
  server: "database-mcp",
  tool_name: "bulk_insert",
  file_path: "/path/to/users.csv",
  data_key: "records",
  tool_args: {table: "users", validate: true}
}
```

## File Format Detection & Conversion

### Supported Formats

| Extension | Format | Conversion Logic |
|-----------|--------|------------------|
| `.json` | JSON | Parse and pass through |
| `.csv` | CSV | Convert to array of objects with headers |
| `.tsv` | TSV | Convert to array of objects (tab-separated) |
| `.yaml`, `.yml` | YAML | Parse to JSON object |
| `.xml` | XML | Convert to JSON representation |
| `.txt` | Text | Pass as string (may attempt JSON parse) |

### Format Detection Algorithm
```typescript
function detectFileFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const formatMap = {
    '.json': 'json',
    '.csv': 'csv', 
    '.tsv': 'tsv',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.txt': 'txt'
  };
  
  return formatMap[ext] || 'txt'; // Default to text
}
```

### Conversion Examples

**CSV to JSON:**
```csv
name,email,age
John,john@example.com,30
Jane,jane@example.com,25
```
→
```json
[
  {"name": "John", "email": "john@example.com", "age": 30},
  {"name": "Jane", "email": "jane@example.com", "age": 25}
]
```

**YAML to JSON:**
```yaml
database:
  host: localhost
  port: 5432
  credentials:
    username: admin
    password: secret
```
→
```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "credentials": {
      "username": "admin", 
      "password": "secret"
    }
  }
}
```

## Data Injection Logic

The `data_key` parameter determines how file content is merged with tool arguments.

### Case 1: No `data_key` (Direct Pass-through)
```typescript
// Input
file_content = [{"name": "John", "age": 30}]
data_key = undefined
tool_args = undefined

// Output (sent to tool)
[{"name": "John", "age": 30}]
```

### Case 2: `data_key` with Additional Args
```typescript
// Input
file_content = [{"name": "John", "age": 30}]
data_key = "users"
tool_args = {table: "customers", validate: true}

// Output (sent to tool)
{
  users: [{"name": "John", "age": 30}],
  table: "customers",
  validate: true
}
```

### Case 3: `data_key` Only
```typescript
// Input
file_content = [{"name": "John", "age": 30}]
data_key = "dataset"
tool_args = undefined

// Output (sent to tool)
{
  dataset: [{"name": "John", "age": 30}]
}
```

### Implementation Function
```typescript
function mergeFileDataWithArgs(
  fileContent: any, 
  dataKey: string | undefined, 
  toolArgs: Record<string, any> | undefined
): any {
  // Case 1: No data_key - file content is the entire args
  if (!dataKey) {
    return fileContent;
  }
  
  // Case 2 & 3: Inject file content at data_key
  const result = { ...(toolArgs || {}) };
  
  // Handle conflicts - file content takes precedence
  if (toolArgs && toolArgs[dataKey] !== undefined) {
    console.warn(`Warning: data_key '${dataKey}' conflicts with existing tool_args. File content will overwrite.`);
  }
  
  result[dataKey] = fileContent;
  return result;
}
```

## Use Cases & Examples

### Database Bulk Operations
```typescript
// users.csv: name,email,department
{
  server: "database-mcp",
  tool_name: "bulk_insert_users",
  file_path: "/data/users.csv",
  data_key: "records",
  tool_args: {
    table: "employees",
    on_conflict: "update",
    batch_size: 500
  }
}

// Tool receives:
{
  records: [
    {name: "Alice", email: "alice@company.com", department: "Engineering"},
    {name: "Bob", email: "bob@company.com", department: "Sales"}
  ],
  table: "employees",
  on_conflict: "update",
  batch_size: 500
}
```

### API Bulk Creation
```typescript
// products.json: [{name: "Widget", price: 29.99}, ...]
{
  server: "shopify-mcp",
  tool_name: "create_products",
  file_path: "/inventory/products.json",
  data_key: "products",
  tool_args: {
    store_id: "12345",
    publish: true,
    inventory_tracking: true
  }
}
```

### Configuration Deployment
```typescript
// service-config.yaml: deployment configuration
{
  server: "kubernetes-mcp",
  tool_name: "deploy_service",
  file_path: "/configs/production-service.yaml", 
  data_key: "spec",
  tool_args: {
    namespace: "production",
    dry_run: false,
    wait_for_ready: true
  }
}
```

### Data Analysis
```typescript
// sales-data.csv: date,amount,product,region
{
  server: "analytics-mcp",
  tool_name: "generate_sales_report",
  file_path: "/reports/q4-sales.csv",
  data_key: "dataset",
  tool_args: {
    report_type: "quarterly",
    include_forecasting: true
  }
}
```

### Simple Processing (No Additional Args)
```typescript
// logs.json: array of log entries
{
  server: "log-processor-mcp",
  tool_name: "analyze_errors",
  file_path: "/logs/application.json"
  // No data_key - file content passed directly
}
```

## Security & Validation

### File Path Security
- **Directory Restriction**: Only read from allowed directories (same as storage directories)
- **Path Traversal Prevention**: Validate resolved paths against allowed directories
- **Permission Checks**: Verify file exists and is readable

### File Size Limits
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

const stats = await fs.stat(filePath);
if (stats.size > MAX_FILE_SIZE) {
  throw new Error(`File size ${stats.size} bytes exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes (10MB)`);
}
```

### Format Validation
- **Extension Check**: Ensure file extension matches supported formats
- **Content Validation**: Validate file content can be parsed in detected format
- **Malformed Data**: Provide clear error messages for parsing failures

## Error Handling

### Common Error Scenarios
1. **File Not Found**: `Error: File '/path/to/data.csv' does not exist or is not readable`
2. **Permission Denied**: `Error: File path '/unauthorized/data.csv' is not within allowed directories`
3. **File Too Large**: `Error: File size 15MB exceeds maximum allowed size of 10MB`
4. **Parse Error**: `Error: Failed to parse CSV file: Invalid format at line 15`
5. **Tool Call Failure**: `Error: Upstream tool 'bulk_insert' failed: Invalid data format`

### Error Response Format
```typescript
{
  content: [
    {
      type: "text",
      text: `Error in call_tool_with_file_content: ${errorMessage}`
    }
  ],
  isError: true
}
```

## Implementation Architecture

### Core Functions
```typescript
// File operations
async function readAndParseFile(filePath: string): Promise<any>
function detectFileFormat(filePath: string): string
function parseFileContent(content: string, format: string): any

// Data transformation
function mergeFileDataWithArgs(fileContent: any, dataKey?: string, toolArgs?: object): any

// Security
function validateFilePath(filePath: string, allowedDirs: string[]): boolean
function validateFileSize(filePath: string, maxSize: number): Promise<void>

// Integration
async function callToolWithFileContent(params: CallToolWithFileParams): Promise<any>
```

### Processing Pipeline
1. **Validate Input**: Check file path, data_key, and tool parameters
2. **Security Check**: Verify file path is allowed and file size is within limits
3. **Read File**: Load file content from disk
4. **Parse Content**: Convert file content to JSON based on detected format
5. **Merge Arguments**: Inject file data into tool arguments using data_key logic
6. **Call Tool**: Execute upstream MCP tool with merged arguments

## Testing Strategy

### Unit Tests
- [ ] File format detection for all supported extensions
- [ ] Data parsing for each format (CSV, JSON, YAML, XML)
- [ ] Data injection logic for all cases (with/without data_key and tool_args)
- [ ] Security validation (path traversal, file size limits)
- [ ] Error handling for malformed files and invalid parameters

### Integration Tests  
- [ ] End-to-end file processing workflows
- [ ] Upstream tool calling with file data
- [ ] Response storage and resource link generation
- [ ] Error scenarios with real file system operations

### Test Files
```
tests/fixtures/
  ├── sample-data.csv
  ├── sample-config.yaml
  ├── sample-data.json
  ├── malformed.csv
  ├── large-file.csv (>10MB)
  └── sample-data.xml
```

## Future Enhancements

### Advanced Features (Later)
- **Nested Data Keys**: Support dot notation like `config.database.users`
- **Data Transformation**: Custom transformation functions for complex conversions
- **Streaming Support**: Handle very large files with streaming parsers
- **Compression**: Support for gzipped files
- **Multiple Files**: Accept arrays of file paths for batch operations
- **Caching**: Cache parsed file content for repeated use

### Performance Optimizations
- **Lazy Loading**: Only parse file when needed
- **Memory Management**: Stream processing for large files
- **Format Caching**: Cache format detection results
- **Connection Pooling**: Reuse upstream MCP connections

## Enhancement: LLM-Selectable Output Format

### Current Issue
The `call_tool_with_file_content` function currently hard-codes the output format as pretty-printed JSON:

```typescript
return {
  content: [
    {
      type: "text",
      text: JSON.stringify(upstreamResponse, null, 2)
    }
  ]
};
```

This approach has limitations:
- **Always JSON**: Even when upstream tools return plain text or human-readable content, it gets wrapped in JSON
- **No Choice**: LLMs cannot select the most appropriate output format for their use case
- **Context Pollution**: JSON formatting can add unnecessary noise when simple string responses are more appropriate

### Proposed Enhancement

Add an `output_format` parameter to allow LLMs to select between JSON and string output formats.

#### New Input Schema Parameter
```typescript
output_format: z.enum(["json", "string"]).optional().describe("Output format for the response. 'json' returns pretty-printed JSON (default), 'string' returns the raw text content from the upstream response")
```

#### Implementation Logic

```typescript
// After calling upstream tool
const upstreamResponse = await callUpstreamTool(server, tool_name, mergedArgs, upstreamConfigs);

// Format response based on selected output format
let responseText: string;
const selectedFormat = output_format || 'json'; // Default to JSON for backward compatibility

switch (selectedFormat) {
  case 'string':
    // Extract actual content and return as string
    const actualContent = extractActualContent(upstreamResponse);
    responseText = typeof actualContent === 'string' 
      ? actualContent 
      : JSON.stringify(actualContent, null, 2);
    break;
    
  case 'json':
  default:
    // Current behavior - return pretty-printed JSON
    responseText = JSON.stringify(upstreamResponse, null, 2);
    break;
}

return {
  content: [
    {
      type: "text",
      text: responseText
    }
  ]
};
```

#### Updated Tool Schema
```typescript
server.registerTool(
  "call_tool_with_file_content",
  {
    title: "Call Tool with File Content",
    description: "Reads structured data from files (CSV, JSON, YAML, XML, TSV, TXT) and passes it to upstream MCP tools. Supports selectable output formats for optimal LLM context management.\n\nOutput Format Options:\n- 'json': Returns full MCP response with metadata (default)\n- 'string': Returns clean text content, ideal for human-readable responses\n\nExamples:\n- Database operation: {server: \"database-mcp\", tool_name: \"bulk_insert\", file_path: \"/data/users.csv\", output_format: \"string\"}\n- API call with JSON analysis: {server: \"api-mcp\", tool_name: \"get_data\", file_path: \"/config.json\", output_format: \"json\"}\n- Text processing: {server: \"nlp-mcp\", tool_name: \"analyze_text\", file_path: \"/docs/content.txt\", output_format: \"string\"}",
    inputSchema: {
      server: z.string().describe("The name of the upstream MCP server (e.g., 'database-mcp', 'shopify-mcp')"),
      tool_name: z.string().describe("The name of the tool to call on the server (e.g., 'bulk_insert', 'create_products')"),
      file_path: z.string().describe("Path to the input file (must be within allowed directories). Supported formats: JSON, CSV, TSV, YAML, XML, TXT"),
      data_key: z.string().optional().describe("Parameter name for file content in tool arguments. If not provided, file content becomes the entire tool arguments"),
      tool_args: z.record(z.any()).optional().describe("Additional arguments to merge with file data. Will error if data_key conflicts with existing keys"),
      output_format: z.enum(["json", "string"]).optional().describe("Output format for the response. 'json' returns full MCP response with metadata (default), 'string' returns clean text content")
    }
  },
  // ... implementation
```

### Use Cases & Examples

#### Use Case 1: Database Bulk Insert (String Output)
```typescript
{
  server: "database-mcp",
  tool_name: "bulk_insert",
  file_path: "/data/users.csv",
  data_key: "records",
  tool_args: {table: "users"},
  output_format: "string"
}

// Response with output_format: "string"
"Successfully inserted 150 records into users table"

// vs Current behavior (always JSON)
{
  "content": [
    {
      "type": "text", 
      "text": "Successfully inserted 150 records into users table"
    }
  ]
}
```

#### Use Case 2: API Analysis (JSON Output)
```typescript
{
  server: "analytics-mcp",
  tool_name: "analyze_data", 
  file_path: "/reports/metrics.json",
  output_format: "json"
}

// Response provides full MCP structure for detailed analysis
{
  "content": [
    {
      "type": "text",
      "text": "{\"summary\": \"Q4 metrics show 23% growth\", \"details\": {...}}"
    }
  ],
  "isError": false
}
```

#### Use Case 3: Text Processing (String Output)
```typescript
{
  server: "nlp-mcp",
  tool_name: "summarize_document",
  file_path: "/documents/report.txt",
  output_format: "string"
}

// Clean text response ideal for further LLM processing
"The document discusses quarterly performance metrics with key findings including revenue growth of 23% and customer satisfaction improvements."
```

### Implementation Details

#### Helper Function for Response Formatting
```typescript
// Add to core.ts
export function formatToolResponse(response: any, format: 'json' | 'string'): string {
  switch (format) {
    case 'string':
      const actualContent = extractActualContent(response);
      return typeof actualContent === 'string' 
        ? actualContent 
        : JSON.stringify(actualContent, null, 2);
        
    case 'json':
    default:
      return JSON.stringify(response, null, 2);
  }
}
```

#### Backward Compatibility
- **Default Behavior**: If `output_format` is not specified, defaults to `"json"` (current behavior)
- **Existing Code**: No changes required to existing implementations
- **Migration Path**: Teams can gradually adopt string format where appropriate

#### Error Handling Enhancement
```typescript
// Error responses should also respect output format
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Failed to call tool with file content: ${errorMessage}`);
  
  const selectedFormat = output_format || 'json';
  let responseText: string;
  
  if (selectedFormat === 'string') {
    responseText = `Error in call_tool_with_file_content: ${errorMessage}`;
  } else {
    responseText = JSON.stringify({
      error: errorMessage,
      tool: `${server}:${tool_name}`,
      timestamp: new Date().toISOString()
    }, null, 2);
  }
  
  return {
    content: [
      {
        type: "text",
        text: responseText
      }
    ],
    isError: true
  };
}
```

### Testing Requirements

#### Unit Tests
- [ ] Test `formatToolResponse()` helper function with various response types
- [ ] Verify backward compatibility (no `output_format` specified)
- [ ] Test string format with text responses
- [ ] Test string format with complex object responses
- [ ] Test JSON format maintains current behavior

#### Integration Tests
- [ ] End-to-end workflows with both output formats
- [ ] Error handling for both formats
- [ ] Upstream tool responses in various formats (text, JSON, structured data)

#### Test Cases
```typescript
// Test data
const textResponse = {
  content: [{ type: "text", text: "Operation completed successfully" }]
};

const jsonResponse = {
  content: [{ type: "text", text: JSON.stringify({status: "success", count: 150}) }],
  metadata: { timestamp: "2024-01-01T00:00:00Z" }
};

// Expected outputs
assert(formatToolResponse(textResponse, 'string') === "Operation completed successfully");
assert(formatToolResponse(textResponse, 'json').includes('"type": "text"'));
```

### Benefits

1. **Reduced Context Noise**: String format eliminates JSON wrapper overhead for simple responses
2. **Better LLM Processing**: Clean text responses are easier for LLMs to work with
3. **Flexible Integration**: JSON format preserves full metadata when needed for analysis
4. **Backward Compatible**: Existing implementations continue to work unchanged
5. **User Choice**: LLMs can select the most appropriate format for their specific use case

### Future Enhancements

This implementation sets the foundation for additional output format options:
- **Raw Format**: Direct upstream response without any processing
- **Structured Format**: Enhanced JSON with response metadata and timing
- **Markdown Format**: Formatted text suitable for documentation
- **Custom Format**: Allow format specification via additional parameters

This implementation provides a robust foundation for file-based MCP tool integration while maintaining security, performance, and usability standards. 