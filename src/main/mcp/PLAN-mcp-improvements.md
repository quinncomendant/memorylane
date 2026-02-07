# MCP Improvements Plan

## Problem

The MCP server exposes a single `search_context` tool. This has three issues at scale:

1. **Near-duplicate results.** Consecutive screenshots of the same activity produce nearly identical entries. Vector search returns the top-k most similar, which are often these near-duplicates. The caller gets 5 results that all say the same thing.

2. **No way to browse a time range.** `query` is required, so the AI cannot ask "what happened today?" without fabricating a semantic query. The storage layer has `getEventsByTimeRange` but it is not exposed via MCP.

3. **Token waste.** Every result includes the full raw OCR text. A single screenshot's OCR can be 2000+ tokens. Five results can cost 10k+ tokens of mostly-redundant screen text.

## Changes

### 1. Add `browse_timeline` tool

A lightweight tool for scanning a time range without a text query.

Parameters:

- `startTime` (string, required) -- same format as `search_context`
- `endTime` (string, required) -- same format as `search_context`
- `appName` (string, optional) -- filter by app
- `limit` (number, optional, default 20) -- max results
- `sampling` (string, optional, default "uniform") -- "uniform" picks evenly spaced entries, "recent_first" returns newest first

Returns a compact list per entry: `{id, timestamp, summary, appName}`. No OCR text, no vectors. This keeps responses small so the AI can scan a full day in one call.

Implementation: call `StorageService.getEventsByTimeRange` (already exists), then apply sampling/limiting in JS before returning. Format each entry as a single line like `[id] [timestamp] [appName] summary`.

### 2. Add `get_event_details` tool

Fetch full details for specific events by ID, for drill-down after browsing.

Parameters:

- `ids` (string[], required) -- list of event IDs from browse/search results

Returns full event data including OCR text for each requested ID. This is the only tool that should return raw OCR.

Implementation: add a `getEventsByIds(ids: string[])` method to `StorageService` (simple `WHERE id IN (...)` query). Format results the same way `search_context` does today.

### 3. Deduplicate `search_context` results by similarity

After the existing vector+FTS merge, walk the results and collapse near-duplicates. Two entries are near-duplicates when:

- Their cosine distance is below a threshold (e.g. 0.15)
- AND they are within a time window (e.g. 15 minutes apart)

Keep the entry with the longer/better summary, discard the rest. This can reuse the vectors already loaded on each `StoredEvent`.

Also: stop returning full OCR text from `search_context`. Return only `{id, timestamp, summary, appName, distance}` -- same compact format as `browse_timeline`. The AI can use `get_event_details` if it needs the raw text.

### 4. Make `query` optional in `search_context`

When `query` is omitted but time filters are provided, fall back to `browse_timeline` behavior (return summaries ordered by time). This makes the tool more flexible but the main reason for `browse_timeline` as a separate tool is clearer intent and a name the AI can discover.

### 5. Update tool descriptions to guide usage

Add a clear description pattern to each tool so the AI knows the intended workflow:

- `browse_timeline`: "Start here for broad questions about what happened during a time period. Returns lightweight summaries."
- `search_context`: "Use for specific questions. Searches by meaning. Returns summaries (use get_event_details for full text)."
- `get_event_details`: "Fetch full OCR text for specific events by ID. Use after browse_timeline or search_context to get details."

## File changes

- `src/main/mcp/server.ts` -- register new tools, update `search_context` formatting, add dedup logic
- `src/main/processor/storage.ts` -- add `getEventsByIds()` method
- `src/shared/types.ts` -- no changes expected (existing types cover the needs)

## Implementation status

- [x] 1. `get_event_details` tool + `getEventsByIds` in storage
- [x] 2. `browse_timeline` tool (wraps `getEventsByTimeRange`, with uniform/recent_first sampling)
- [ ] 3. Similarity dedup in `search_context` (deferred -- adds complexity, revisit when duplicates become a real problem)
- [x] 4. Make `query` optional (falls back to chronological time-range listing)
- [x] 5. Updated all tool descriptions
- [x] `search_context` returns compact summaries (no raw OCR) -- part of step 3 done early
