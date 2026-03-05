# @deusxmachina-dev/memorylane-cli

CLI for querying the [MemoryLane](https://github.com/deusXmachina-dev/memorylane) activity database. Designed for AI agents (Claude Code, Cursor, etc.) to access your screen activity history without the Electron app running.

## Install

```bash
npm install -g @deusxmachina-dev/memorylane-cli
```

## Setup

Point the CLI at your MemoryLane database:

```bash
memorylane set-db ~/Library/Application\ Support/MemoryLane/memorylane.db
```

On Windows:

```bash
memorylane set-db "%APPDATA%\MemoryLane\memorylane.db"
```

## Commands

```bash
memorylane stats                          # Database statistics
memorylane search "auth refactor"         # Full-text search
memorylane search "auth" --mode vector    # Semantic search
memorylane timeline --limit 10            # Recent activities
memorylane timeline --app Chrome          # Filter by app
memorylane activity <id>                  # Activity details
memorylane patterns                       # Detected patterns
memorylane pattern <id>                   # Pattern details
memorylane get-db                         # Show resolved DB path
```

## DB path resolution

1. `--db-path` flag (always wins)
2. `MEMORYLANE_DB_PATH` env var
3. Saved config via `memorylane set-db`
4. Platform default

## Semantic search

Vector search requires the optional `@huggingface/transformers` dependency:

```bash
npm install -g @huggingface/transformers
memorylane search "what was I working on" --mode vector
```

## License

GPL-3.0-or-later
