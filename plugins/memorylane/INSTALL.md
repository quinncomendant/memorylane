# MemoryLane — Installation

## 1. Install the plugin

Watch the [installation walkthrough](https://www.loom.com/share/f8bcc7db424746b99c0a93748dec3da6).

Install from the GitHub Marketplace:

```
deusxmachina-dev/memorylane
```

<details>
<summary><h2>2. Set up the MCP server (skip if you have the MemoryLane desktop app installed)</h2></summary>

If you have the **MemoryLane desktop app** with desktop integration enabled, skip this section — the app handles MCP setup for you.

If you don't have the desktop app, follow the steps below.

Watch the [MCP setup walkthrough](https://www.loom.com/share/b6330ba741654a87bc9875105c973daa).

1. Open the config file:

   | OS          | Path                                                              |
   | ----------- | ----------------------------------------------------------------- |
   | **macOS**   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
   | **Windows** | `%APPDATA%\Claude\claude_desktop_config.json`                     |

2. Add `memorylane` inside the `mcpServers` object ([copy from our repo](https://github.com/deusXmachina-dev/memorylane/tree/main/plugins/memorylane)):

   ```json
   {
     "mcpServers": {
       "memorylane": {
         "command": "npx",
         "args": ["-y", "-p", "@deusxmachina-dev/memorylane-cli@latest", "memorylane-mcp"],
         "env": {}
       }
     }
   }
   ```

   If you already have other MCP servers, add the `"memorylane": { ... }` block alongside them.

3. Restart Claude Desktop.

To use a custom database path, set `MEMORYLANE_DB_PATH` in the config:

```json
"env": {
  "MEMORYLANE_DB_PATH": "/path/to/your/memorylane.db"
}
```

Or use the `set_db_path` tool after connecting.

</details>
