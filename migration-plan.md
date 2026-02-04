# Migration Plan: Electron Forge → electron-vite + electron-builder

This document outlines the step-by-step migration from Electron Forge to electron-vite + electron-builder.

## Overview

| Current | Target |
|---------|--------|
| @electron-forge/plugin-vite | electron-vite |
| @electron-forge/cli (package/make) | electron-builder |
| Multiple vite config files | Single electron.vite.config.ts |

## Prerequisites

- Ensure you have a clean git state before starting
- Node.js 18+ recommended

---

## Step 1: Remove Electron Forge Dependencies

### Files to Delete

```
forge.config.ts
forge.env.d.ts
vite.main.config.ts
vite.preload.config.ts
vite.renderer.config.ts
```

### Dependencies to Remove from package.json

Remove from `devDependencies`:
```json
"@electron-forge/cli": "^7.11.1",
"@electron-forge/maker-deb": "^7.11.1",
"@electron-forge/maker-rpm": "^7.11.1",
"@electron-forge/maker-squirrel": "^7.11.1",
"@electron-forge/maker-zip": "^7.11.1",
"@electron-forge/plugin-auto-unpack-natives": "^7.11.1",
"@electron-forge/plugin-fuses": "^7.11.1",
"@electron-forge/plugin-vite": "^7.11.1",
"@electron/fuses": "^1.8.0",
"@types/electron-squirrel-startup": "^1.0.2",
```

Remove from `dependencies`:
```json
"electron-squirrel-startup": "^1.0.1",
```

---

## Step 2: Add electron-vite + electron-builder Dependencies

### Dependencies to Add

Add to `devDependencies`:
```json
"electron-vite": "^2.3.0",
"electron-builder": "^25.1.8",
```

Note: Keep `@electron/rebuild` - it's still needed for native modules.

---

## Step 3: Create electron-vite Configuration

### Create `electron.vite.config.ts`

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: {
        external: [
          'uiohook-napi',
          '@lancedb/lancedb',
          'onnxruntime-node',
          'onnxruntime-common',
          'sharp',
          'active-win',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
    },
  },
  renderer: {
    build: {
      sourcemap: true,
    },
  },
});
```

---

## Step 4: Restructure Source Files

electron-vite expects a specific directory structure. We need to reorganize:

### Current Structure
```
src/
├── main.ts          # Main process entry
├── preload.ts       # Preload script
├── renderer.ts      # Renderer entry
├── index.css
├── main/            # Main process modules
└── shared/          # Shared types
index.html           # In root
```

### Target Structure
```
src/
├── main/
│   ├── index.ts     # Main process entry (renamed from main.ts)
│   ├── mcp/
│   ├── paths.ts
│   ├── processor/
│   └── recorder/
├── preload/
│   └── index.ts     # Preload entry (renamed from preload.ts)
├── renderer/
│   ├── index.html   # Moved from root
│   ├── index.ts     # Renderer entry (renamed from renderer.ts)
│   └── index.css    # Moved from src/
└── shared/          # Stays the same
```

### File Moves Required

| From | To |
|------|-----|
| `src/main.ts` | `src/main/index.ts` |
| `src/preload.ts` | `src/preload/index.ts` |
| `src/renderer.ts` | `src/renderer/index.ts` |
| `src/index.css` | `src/renderer/index.css` |
| `index.html` | `src/renderer/index.html` |

---

## Step 5: Update Source Code

### 5.1 Update `src/main/index.ts`

**Change 1:** Remove electron-squirrel-startup import

```typescript
// REMOVE this line:
import started from 'electron-squirrel-startup';

// REMOVE this block:
if (started) {
  app.quit();
}
```

**Change 2:** Fix asset path for tray icon

The `__dirname` behavior changes in electron-vite. Update the icon path:

```typescript
// BEFORE:
const iconPath = path.join(__dirname, '../../assets/tray-icon.png');

// AFTER:
import { join } from 'path';

// At the top of the file, add:
const isDev = process.env.NODE_ENV === 'development';

// In createTray():
const iconPath = isDev
  ? join(__dirname, '../../assets/tray-icon.png')
  : join(process.resourcesPath, 'assets/tray-icon.png');
```

### 5.2 Update `src/renderer/index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Hello World!</title>
  </head>
  <body>
    <h1>💖 Hello World!</h1>
    <p>Welcome to your Electron application.</p>
    <script type="module" src="./index.ts"></script>
  </body>
</html>
```

Note: Changed `src="/src/renderer.ts"` to `src="./index.ts"` (relative path).

### 5.3 Update `src/renderer/index.ts`

```typescript
import './index.css';

console.log(
  '👋 This message is being logged by "renderer.ts", included via Vite',
);
```

No changes needed to the content, just ensure the CSS import path is correct.

---

## Step 6: Create electron-builder Configuration

### Create `electron-builder.yml`

```yaml
appId: com.memorylane.app
productName: memorylane
copyright: Copyright © 2024 Petr Ungar

directories:
  buildResources: assets
  output: dist

files:
  - out/**/*
  - package.json

extraResources:
  - from: assets
    to: assets
    filter:
      - "**/*"

asar: true
asarUnpack:
  - "node_modules/uiohook-napi/**/*"
  - "node_modules/sharp/**/*"
  - "node_modules/@lancedb/**/*"
  - "node_modules/@img/**/*"
  - "node_modules/onnxruntime-node/**/*"
  - "node_modules/active-win/**/*"
  - "**/*.node"

mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch:
        - arm64
        - x64
    - target: zip
      arch:
        - arm64
        - x64

win:
  target:
    - target: nsis
      arch:
        - x64

linux:
  target:
    - target: deb
      arch:
        - x64
    - target: rpm
      arch:
        - x64
  category: Utility

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

---

## Step 7: Update package.json

### Update `main` entry point

```json
{
  "main": "./out/main/index.js"
}
```

### Update `scripts`

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "npm run build && electron-builder --dir",
    "make": "npm run build && electron-builder",
    "make:mac": "npm run build && electron-builder --mac",
    "make:win": "npm run build && electron-builder --win",
    "make:linux": "npm run build && electron-builder --linux",
    "lint": "eslint --ext .ts,.tsx .",
    "test": "vitest",
    "postinstall": "electron-rebuild -f -w uiohook-napi,@lancedb/lancedb,onnxruntime-node,active-win",
    "db:search": "tsx scripts/db-search.ts",
    "db:stats": "tsx scripts/db-stats.ts",
    "mcp:start": "tsx scripts/mcp-server.ts",
    "mcp:inspector": "npx @modelcontextprotocol/inspector npm run mcp:start"
  }
}
```

### Final package.json devDependencies

```json
{
  "devDependencies": {
    "@electron/rebuild": "^4.0.3",
    "@types/uuid": "^10.0.0",
    "@typescript-eslint/eslint-plugin": "^5.62.0",
    "@typescript-eslint/parser": "^5.62.0",
    "electron": "40.1.0",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "eslint": "^8.57.1",
    "eslint-plugin-import": "^2.32.0",
    "tsx": "^4.19.0",
    "typescript": "~4.5.4",
    "vite": "^5.4.21",
    "vitest": "^4.0.18"
  }
}
```

### Final package.json dependencies

```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.23.0",
    "@modelcontextprotocol/sdk": "^1.25.3",
    "@openrouter/sdk": "^0.5.1",
    "@xenova/transformers": "^2.17.2",
    "active-win": "^8.2.1",
    "dotenv": "^17.2.3",
    "sharp": "^0.34.5",
    "uiohook-napi": "^1.5.4",
    "uuid": "^13.0.0"
  }
}
```

---

## Step 8: Update TypeScript Configuration

### Update `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noImplicitAny": true,
    "sourceMap": true,
    "baseUrl": ".",
    "outDir": "dist",
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "dist"]
}
```

Key changes:
- `module`: `ESNext` (instead of `commonjs`)
- `moduleResolution`: `bundler` (for Vite compatibility)
- Added `isolatedModules: true`

---

## Step 9: Update .gitignore

Add these entries:

```gitignore
# electron-vite output
out/

# electron-builder output
dist/
```

---

## Step 10: Update CLAUDE.md

Update the development commands section:

```markdown
## Development Commands

\`\`\`bash
# Start development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Package the application (unpacked)
npm run package

# Create distributable packages
npm run make

# Platform-specific builds
npm run make:mac
npm run make:win
npm run make:linux

# Lint TypeScript files
npm run lint
\`\`\`
```

---

## Commit Plan

### Commit 1: Remove Electron Forge
- Delete `forge.config.ts`
- Delete `forge.env.d.ts`
- Delete `vite.main.config.ts`
- Delete `vite.preload.config.ts`
- Delete `vite.renderer.config.ts`
- Update `package.json` to remove Forge dependencies
- Run `npm install`

### Commit 2: Add electron-vite + electron-builder
- Add `electron-vite` and `electron-builder` to devDependencies
- Create `electron.vite.config.ts`
- Create `electron-builder.yml`
- Update `package.json` scripts
- Run `npm install`

### Commit 3: Restructure source files
- Move `src/main.ts` → `src/main/index.ts`
- Move `src/preload.ts` → `src/preload/index.ts`
- Move `src/renderer.ts` → `src/renderer/index.ts`
- Move `src/index.css` → `src/renderer/index.css`
- Move `index.html` → `src/renderer/index.html`
- Update import paths as needed

### Commit 4: Update source code for electron-vite
- Remove electron-squirrel-startup from `src/main/index.ts`
- Fix asset paths for tray icon
- Update `src/renderer/index.html` script path
- Update `tsconfig.json`

### Commit 5: Update documentation and cleanup
- Update `CLAUDE.md`
- Update `.gitignore`
- Test build with `npm run dev` and `npm run make`

---

## Verification Checklist

After migration, verify:

- [ ] `npm run dev` starts the app in development mode
- [ ] `npm run build` completes without errors
- [ ] `npm run package` creates an unpacked app in `dist/`
- [ ] `npm run make` creates distributable packages
- [ ] Tray icon loads correctly
- [ ] Screenshot capture works
- [ ] Native modules load without errors:
  - [ ] `uiohook-napi` (interaction monitoring)
  - [ ] `sharp` (image processing)
  - [ ] `@lancedb/lancedb` (vector database)
  - [ ] `active-win` (active window detection)

---

## Troubleshooting

### Native module not found

If you see `Cannot find module 'xyz'`:
1. Ensure the module is in `asarUnpack` in `electron-builder.yml`
2. Ensure the module is in `external` in `electron.vite.config.ts`
3. Run `npm run postinstall` to rebuild native modules

### __dirname not working

electron-vite handles `__dirname` differently. In the main process:
- In dev: `__dirname` points to source
- In production: `__dirname` points to `out/main/`

For assets, use `process.resourcesPath` in production.

### CSS not loading

Ensure the CSS import in `src/renderer/index.ts` uses the correct relative path:
```typescript
import './index.css';
```
