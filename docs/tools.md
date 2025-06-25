# Tool Discovery & Inspection

This document explains how **Abstract** exposes upstream MCP tools to callers while keeping the language-model context small and predictable.

## 1. list_available_tools

### Input schema
```jsonc
{
  "detailed?": false,          // optional – include full input schemas when true
  "filter_by_server?": ""      // optional – restrict listing to one upstream server
}
```

### Behaviour
1. **Server selection**  
   • If `filter_by_server` is supplied, only that server is queried.  
   • Otherwise every server listed in `ABSTRACT_PROXY_SERVERS` is queried in sequence.
2. **Result construction**  
   • Each tool is returned as an object, never a free-form string.  
   • Base shape when `detailed = false`:
   ```jsonc
   {
     "server": "tavily-mcp",
     "tool": "search",
     "description": "Perform a web search"
   }
   ```
   • When `detailed = true`, the same object is extended with
   ```jsonc
   "inputSchema": {/* zod schema from upstream */}
   ```

## 2. list_tool_details

Retrieves the full definition for a *single* tool.

### Input schema
```jsonc
{
  "server": "tavily-mcp",
  "tool_name": "search"
}
```

### Output example
```jsonc
{
  "name": "search",
  "description": "Perform a web search",
  "inputSchema": {/* ... */}
}
```

Because only one tool is returned, the payload is nearly always small enough to be inlined; the cache fallback is still applied for safety.

## 3. Rationale & performance notes

* **Structured output** – Giving the model explicit keys (`server`, `tool`, `description`) removes the need for brittle string parsing.
* **Two-step discovery** – The vast majority of workflows just need to know *what* tools exist. Only occasionally do they need to inspect their parameters. Splitting the APIs optimises token usage in the common case.
* **Automatic caching** – Large responses seamlessly switch to a file-based reference so the chat context is never flooded, yet the data remain available through the existing file-access tools.

## 4. Future considerations

* Add an optional `search` parameter for client-side filtering if the number of upstream tools grows further.
* Embed a hash of each server's tool list in the cache file name so we can reuse cached listings until something changes. 