---
allowed-tools: mcp__memorylane__browse_timeline, mcp__memorylane__search_context, mcp__memorylane__get_activity_details
description: Generate a swimlane process flowchart (SVG + JPEG) from a detected pattern or described workflow
---

# Process Flowchart

Generate a clean, minimal swimlane process flowchart from a detected pattern or user-described workflow. Output is both SVG and JPEG. The visual style, layout rules, and rendering pipeline are defined in `skills/process-flowchart/SKILL.md`.

## Instructions

### Step 1 — Identify the Process

Determine which process to visualize:

1. If the user names a specific pattern (e.g., from a previous `/discover-patterns` run), use that as the starting point.
2. If the user describes a process vaguely ("the thing I do with invoices"), ask a clarifying question to get the key apps and actions involved.
3. If nothing is specified, ask: "Which process would you like me to visualize? Name it or describe the key apps/steps and I'll find it in your activity."

### Step 2 — Search for Instances

Cast a wide net across 30 days:

```
search_context(query="<process description + key apps>", startTime="30 days ago", endTime="now", limit=30)
```

Use the pattern name, key apps, and distinguishing actions as search terms. Try 2–3 query variations if the first returns sparse results.

### Step 3 — Cluster into Occurrences

Group returned activities by date proximity — activities within 60 minutes of each other likely belong to the same occurrence. Count distinct occurrences.

- If **5+ occurrences**: pick the 3–5 clearest for deep dive.
- If **3–4 occurrences**: deep dive all of them.
- If **< 3 occurrences**: use the fallback in Step 5.

### Step 4 — Deep Dive

For the selected instances, fetch full details:

```
get_activity_details(ids=["id1", "id2", "id3", ...])
```

Use OCR text to understand exactly what happens at each step — what apps are used, what actions are taken, and where the process branches.

**Privacy**: never reproduce passwords, API keys, or personal messages from OCR in the output.

### Step 5 — Fallback for Sparse Data

If fewer than 3 instances were found in Step 2:

1. Use any known dates from the search results as anchors.
2. `browse_timeline` around each known date with a ±2 hour window:

```
browse_timeline(startTime="<known_date> - 2 hours", endTime="<known_date> + 2 hours", limit=50, sampling="uniform")
```

3. Reconstruct the process sequence from surrounding context.
4. If still fewer than 2 clear instances after fallback, tell the user there isn't enough data. Suggest they try again after performing the process a few more times with MemoryLane running.

### Step 6 — Synthesize Steps

Cross-reference all deep-dived instances to build:

1. **Canonical step sequence** — steps that appear consistently across instances
2. **Categories** — the app/tool for each step (mapped to the color palette in the skill file)
3. **Variations** — which steps change between instances (these become variable nodes)
4. **Decision points** — where the process branches (these become diamond nodes)

**Anonymize by default** — follow the anonymization rules in the skill file. Replace client names, person names, account numbers, and sensitive identifiers with generic labels.

### Step 7 — Render Flowchart

Follow the rendering pipeline in `skills/process-flowchart/SKILL.md`:

1. **Determine lanes** — one per unique category, ordered by first appearance.
2. **Structure steps as data** — enforce text limits (title: 20 chars, subtitle: 28 chars, decision: 22 chars). Shorten aggressively.
3. **Generate SVG with Python** — write a Python script that calculates layout, renders lane backgrounds, cards, connectors, decision diamonds, and legend per the skill spec.
4. **Convert SVG to JPEG** — use the weasyprint → pdftoppm pipeline (not cairosvg or ImageMagick). Install dependencies if missing:

```bash
pip install weasyprint pdf2image --break-system-packages
```

5. Save both files using a slugified process name (e.g., "Client Onboarding" → `client-onboarding.svg` and `client-onboarding.jpg`).

### Step 8 — Deliver

Tell the user both files have been saved and show the file paths. If the JPEG conversion fails (missing dependencies), deliver the SVG and explain how to install the missing tools.

## Notes

- **Don't duplicate** — the visual style, layout rules, card colors, connector routing, and rendering pipeline live in `skills/process-flowchart/SKILL.md`. Always reference that file.
- **Minimum data threshold** — need at least 2 clear instances to produce a reliable flowchart. Below that, tell the user.
- **Privacy** — always anonymize by default. Only use real tool names when they're generic enough to be safe (e.g., "Slack", "Google Sheets").
- **Scope** — one flowchart per process. If the user wants multiple, run this command once per process.
