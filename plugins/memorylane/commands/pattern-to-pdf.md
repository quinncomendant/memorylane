---
allowed-tools: mcp__memorylane__browse_timeline, mcp__memorylane__search_context, mcp__memorylane__get_activity_details
description: Generate a process description document as a downloadable PDF from a detected pattern
---

# Pattern to PDF

Generate a shareable process briefing from a detected pattern or user-described workflow — a visual process map, step-by-step walkthrough, occurrence stats, and improvement opportunities. Output is a downloadable PDF.

## Instructions

The full methodology, document structure, process map design, and HTML template live in `skills/pattern-to-pdf/SKILL.md`. This command orchestrates the workflow.

### Step 1 — Identify the Process

Determine which process to document:

1. If the user names a specific pattern (e.g., from a previous `/discover-patterns` run), use that as the starting point.
2. If the user describes a process vaguely ("the thing I do with invoices"), ask a clarifying question to get the key apps and actions involved.
3. If nothing is specified, ask: "Which process would you like me to document? Name it or describe the key apps/steps and I'll find it in your activity."

### Step 2 — Search for Instances

Cast a wide net across 30 days:

```
search_context(query="<process description + key apps>", startTime="30 days ago", endTime="now", limit=30)
```

Use the pattern name, key apps, and distinguishing actions as search terms. Try 2–3 query variations if the first returns sparse results (e.g., search by app name, then by action description, then by output artifact).

### Step 3 — Cluster into Occurrences

Group returned activities by date proximity — activities within 60 minutes of each other likely belong to the same occurrence. Count distinct occurrences and note their date ranges.

- If **5+ occurrences**: excellent — pick the 3–5 clearest for deep dive.
- If **3–4 occurrences**: sufficient — deep dive all of them.
- If **< 3 occurrences**: use the fallback in Step 4.

### Step 4 — Deep Dive

For the selected instances, fetch full details:

```
get_activity_details(ids=["id1", "id2", "id3", ...])
```

Use OCR text to understand exactly what happens at each step — what fields are filled, what data moves between apps, what decisions are made.

**Privacy**: never reproduce passwords, API keys, or personal messages from OCR in the output.

### Step 5 — Fallback for Sparse Data

If fewer than 3 instances were found in Step 2:

1. Use any known dates from the search results as anchors.
2. `browse_timeline` around each known date with a ±2 hour window:

```
browse_timeline(startTime="<known_date> - 2 hours", endTime="<known_date> + 2 hours", limit=50, sampling="uniform")
```

3. Reconstruct the process sequence from surrounding context.
4. If still fewer than 2 clear instances after fallback, tell the user there isn't enough data to produce a reliable document. Suggest they try again after performing the process a few more times with MemoryLane running.

### Step 6 — Synthesize

Cross-reference all deep-dived instances to build:

1. **Canonical step sequence** — steps that appear consistently across instances
2. **Variations** — what changes between instances
3. **Decision points** — where the process branches
4. **Timing** — average duration overall and per step (from timestamps)
5. **Opportunity** — biggest time sink and what's automatable

### Step 7 — Render as PDF

Use the HTML template from the skill file to produce the final document. Include:

1. **Header** with process name and scan metadata
2. **Executive summary** — 3–4 sentences
3. **At a Glance stats** — frequency, duration, apps, last seen, instances
4. **Process map** — vertical flowchart using the node types from the skill file (solid for constant steps, dashed for variable, distinct color for decisions)
5. **Steps table** — numbered walkthrough with app, action, and what varies
6. **Opportunity section** — time sink, automatable parts, concrete suggestion
7. **Footer** with methodology note

**Convert to PDF:**

1. Wrap the filled-in HTML template in a full HTML document:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page {
        margin: 24px;
      }
      body {
        margin: 0;
        padding: 24px;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    <!-- filled-in template HTML here -->
  </body>
</html>
```

2. Write to `/tmp/pdd-temp.html` using the Write tool.
3. Convert to PDF using Bash — use a slugified version of the process name (e.g., "Client Onboarding" → `client-onboarding-pdd.pdf`):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="<slug>-pdd.pdf" /tmp/pdd-temp.html 2>/dev/null && rm /tmp/pdd-temp.html
```

If Chrome is not installed, fall back to saving as `<slug>-pdd.html` and tell the user.

4. Tell the user the PDF has been saved and they can open it.

## Notes

- **Don't duplicate** — the document structure, process map design, and HTML template live in `skills/pattern-to-pdf/SKILL.md`. Always reference that file.
- **Minimum data threshold** — need at least 2 clear instances to produce a document. Below that, tell the user.
- **Privacy** — summaries are the primary data source. Only use `get_activity_details` for the deep-dive step. Never reproduce raw OCR in the output.
- **Scope** — one document per process. If the user wants multiple processes documented, run this command once per process.
