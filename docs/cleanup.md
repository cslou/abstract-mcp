# NPM Publishing Cleanup Checklist

This document outlines the **crucial** changes needed before publishing `abstract-mcp` to npm. These are the minimum requirements - everything else is nice-to-have.

## 🚨 Critical Fixes Required

### 1. Package.json Updates
**File:** `package.json`

```json
{
  "name": "abstract-mcp",
  "version": "1.0.0", 
  "description": "A caching proxy MCP server that prevents context bloat by storing large responses as files",
  "keywords": ["mcp", "model-context-protocol", "proxy", "cache"],
  "author": "cslou",
  "license": "MIT",
  "repository": {
    "type": "git", 
    "url": "https://github.com/cslou/abstract-mcp.git"
  },
  "main": "./dist/abstract.js",
  "bin": {
    "abstract-mcp": "./dist/abstract.js"
  },
  "files": [
    "dist/**/*",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/abstract.js", 
    "dev": "tsc && node dist/abstract.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

**Key Changes:**
- ✅ Name: `abstract-mcp` (descriptive and likely available)
- ✅ Fix `main` entry point to `./dist/abstract.js` 
- ✅ Add `bin` for CLI usage
- ✅ Add proper description, keywords, author
- ✅ Add `files` array to control what gets published
- ✅ Add `prepublishOnly` script for safety

### 2. Add Shebang Line
**File:** `src/abstract.ts` (top of file)

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// ... rest of existing code
```

**Why:** Required for CLI executable when installed globally

### 3. Create .npmignore
**File:** `.npmignore`

```
src/
tests/
docs/
cache/
*.log
.DS_Store
.env*
tsconfig.json
vitest.config.ts
CLAUDE.md
```

**Why:** Prevents unnecessary files from being published, keeps package size small

### 4. Create LICENSE File
**File:** `LICENSE`

```
MIT License

Copyright (c) 2024 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Why:** Legal requirement for open source packages

### 5. Update README Installation Section
**File:** `README.md` (replace existing Installation section)

```markdown
## Installation

### From npm (Recommended)
```bash
npm install -g abstract-mcp
```

### From source
```bash
git clone https://github.com/username/abstract-mcp.git
cd abstract-mcp
npm install
npm run build
```

## Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "abstract": {
      "command": "abstract-mcp",
      "args": [
        "/path/to/allowed/storage/dir1",
        "/path/to/allowed/storage/dir2"  
      ],
      "env": {
        "APP_CONFIG_PATH": "/path/to/claude/desktop/config.json",
        "ABSTRACT_PROXY_SERVERS": "tavily-mcp,gordian"
      }
    }
  }
}
```
```

**Why:** Users need to know how to install and use the CLI command

## 🧪 Pre-Publishing Test

Before publishing, run these commands to verify everything works:

```bash
# 1. Build and test
npm run build
npm test

# 2. Test local installation
npm pack
npm install -g ./abstract-mcp-1.0.0.tgz

# 3. Test CLI works
abstract-mcp --help  # Should not error
which abstract-mcp    # Should show global path

# 4. Clean up test
npm uninstall -g abstract-mcp
rm abstract-mcp-1.0.0.tgz
```

## 📦 Publishing Commands

Once all changes above are complete:

```bash
# 1. Final checks
npm run prepublishOnly

# 2. Publish (first time)
npm login
npm publish

# 3. Verify publication
npm view abstract-mcp
```

## ✅ Completion Checklist

- [ ] Update package.json with all required fields
- [ ] Add shebang line to src/abstract.ts
- [ ] Create .npmignore file
- [ ] Create LICENSE file  
- [ ] Update README installation section
- [ ] Run pre-publishing tests
- [ ] Publish to npm
- [ ] Verify package works when installed globally

## 📝 Notes

- **Name availability**: Check if `abstract-mcp` is available on npm with `npm view abstract-mcp`
- **Git repository**: Update URLs in package.json to match your actual repository
- **Author info**: Replace placeholder author information with your details
- **Version**: Start with 1.0.0 for initial stable release

**Estimated time:** 30-45 minutes to complete all changes 