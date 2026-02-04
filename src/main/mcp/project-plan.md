# Project Plan: MCP Server MVP

## Goal
Add a minimal MCP server to MemoryLane that exposes one `search_context` tool, plus CLI tooling for development and debugging.

## Success Criteria
- [ ] CLI can query the LanceDB and return results
- [ ] MCP server runs alongside the Electron app
- [ ] `search_context` tool works in Claude Desktop or Cursor

---

## Tickets

### 1. CLI Tooling: Database Query Script ✅

**Summary**: Create a standalone CLI script to search the database from the terminal.

**Why**: Enables verification that data is being captured correctly and search works as expected. Essential for development and debugging.

**Acceptance Criteria**:
- [x] Script can be run via `npm run db:search "query"`
- [x] Outputs results with timestamp and text content
- [x] Works with the production database path (`userData/lancedb`)
- [x] Handles empty results gracefully

**Technical Notes**:
- Create `scripts/db-search.ts`
- Reuse `StorageService` and `EmbeddingService` classes
- Use `ts-node` or compile to JS for execution
- Parse database path from args or use default

**Estimate**: Small (~1-2 hours)

---

### 2. CLI Tooling: Database Stats Command ✅

**Summary**: Add a command to show database statistics.

**Why**: Useful for understanding what's in the database without running searches.

**Acceptance Criteria**:
- [x] Script can be run via `npm run db:stats`
- [x] Shows: total entry count, date range (oldest to newest), database size on disk
- [x] Works with the production database path

**Technical Notes**:
- Add to existing CLI or create `scripts/db-stats.ts`
- May need to add `count()` method to `StorageService`

**Estimate**: Small (~1 hour)

**Depends on**: Ticket 1 (shared infrastructure)

---

### 3. MCP Server: Project Setup ✅

**Summary**: Install MCP SDK and create the basic server structure.

**Why**: Foundation for the MCP integration.

**Acceptance Criteria**:
- [x] `@modelcontextprotocol/sdk` installed
- [x] Basic MCP server file created at `src/main/mcp/server.ts`
- [x] Server can start and respond to `initialize` request
- [x] Can be tested standalone (outside Electron) via stdio

**Technical Notes**:
- Use `@modelcontextprotocol/sdk` package
- Start with stdio transport (simplest, works with Claude Desktop)
- Create minimal server that just initializes successfully

**Estimate**: Small (~1-2 hours)

---

### 4. MCP Server: Implement `search_context` Tool ✅

**Summary**: Add the core search tool to the MCP server.

**Why**: This is the main value-add - letting AI assistants search user context.

**Acceptance Criteria**:
- [x] Tool is registered with name `search_context`
- [x] Accepts `query` parameter (string, required)
- [x] Accepts optional `limit` parameter (number, default 5)
- [x] Returns array of results with `timestamp`, `text`, and `relevance_score`
- [x] Uses hybrid search (vector + FTS) via `EventProcessor`

**Technical Notes**:
- Wire up to existing `EventProcessor.search()` method
- Format results for LLM consumption (human-readable timestamps)
- Consider deduplication if vector and FTS return same results

**Estimate**: Medium (~2-3 hours)

**Depends on**: Ticket 3

---

### 5. MCP Server: Electron Integration

**Summary**: Run the MCP server as part of the Electron application.

**Why**: The MCP server needs to run whenever the app is running so AI assistants can connect.

**Acceptance Criteria**:
- [ ] MCP server starts automatically when Electron app starts
- [ ] Server shuts down cleanly when app quits
- [ ] Server has access to the same database as the main app
- [ ] Connection info available for client configuration

**Technical Notes**:
- Option A: Run in main process (simpler, shares services)
- Option B: Spawn as child process (isolated, but needs IPC)
- Recommend Option A for MVP
- May need to refactor `StorageService`/`EmbeddingService` initialization to share instances

**Estimate**: Medium (~2-3 hours)

**Depends on**: Ticket 4

---

### 6. MCP Server: Client Configuration & Documentation

**Summary**: Document how to connect Claude Desktop or Cursor to the MCP server.

**Why**: Users need to know how to actually use the integration.

**Acceptance Criteria**:
- [ ] Instructions for Claude Desktop configuration (`claude_desktop_config.json`)
- [ ] Instructions for Cursor configuration
- [ ] Troubleshooting section for common issues
- [ ] Update README with MCP feature description

**Technical Notes**:
- Claude Desktop config needs path to the Electron app or a wrapper script
- May need a small shell script to invoke the MCP server mode
- Consider adding `--mcp` flag to the app for standalone MCP mode

**Estimate**: Small (~1-2 hours)

**Depends on**: Ticket 5

---

## Execution Order

```
Ticket 1 (CLI Search)
    ↓
Ticket 2 (CLI Stats) ──────────┐
    ↓                          │
Ticket 3 (MCP Setup)           │  (can be parallel)
    ↓                          │
Ticket 4 (search_context)      │
    ↓                          │
Ticket 5 (Electron Integration)│
    ↓                          │
Ticket 6 (Documentation) ←─────┘
```

**Recommended approach**: 
1. Start with Ticket 1 - validates your database has data and search works
2. Do Ticket 3 in parallel or right after
3. Sequential from there

---

## Total Estimate

| Ticket | Estimate |
|--------|----------|
| 1. CLI Search | 1-2 hours |
| 2. CLI Stats | 1 hour |
| 3. MCP Setup | 1-2 hours |
| 4. search_context | 2-3 hours |
| 5. Electron Integration | 2-3 hours |
| 6. Documentation | 1-2 hours |
| **Total** | **8-13 hours** |

---

## Future Enhancements (Post-MVP)

Not in scope for this plan, but worth noting for later:

- [ ] Additional MCP tools: `get_recent_context`, `get_context_by_date`
- [ ] MCP resources: `memorylane://stats` for passive context
- [ ] Richer search: filter by app, time range, trigger type
- [ ] HTTP API as alternative to MCP
- [ ] Debug UI in the Electron app
