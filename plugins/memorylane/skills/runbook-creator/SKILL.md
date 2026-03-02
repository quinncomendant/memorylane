---
name: runbook-creator
description: Transform a workflow pattern identified from screen activity into a step-by-step automation runbook (.md file) that any agentic tool can execute.
---

# Runbook Creator

Transform a workflow pattern into a concrete, actionable automation runbook. The output is a `.md` file that any engineer, automation tool, or agentic AI can follow to replicate or automate the process.

## Input

A workflow pattern — either described by the user or discovered during the current session via `/discover-patterns`. The pattern should include at minimum:

- A description of the repeated process
- The apps involved
- Approximate frequency

## Methodology

### Step 1 — Gather Evidence from Activity Data

Use the timeline and activity tools to build a complete picture of the workflow:

1. `search_context(query)` — search for activities matching the pattern description across a wide window (30 days). This finds all instances of the workflow.
2. `browse_timeline` — for clusters of matching activities, scan the surrounding timeline to capture the full sequence (the steps before and after the core loop).
3. `get_activity_details(ids)` — for the clearest instances, extract exact steps, apps, URLs, UI elements, field names, and data flow from the OCR text.

Aim to examine **at least 3 distinct instances** of the workflow to distinguish what's consistent from what varies.

### Step 2 — Reconstruct the Full Process

From the evidence, map the complete workflow from trigger to completion:

- What triggers it (email arrival, time of day, manual decision)
- Each step in order: what app, what action, what data moves where
- How the user knows it's done
- How long it typically takes (from activity timestamps)

A single instance may only capture part of the workflow. Cross-reference multiple instances to reconstruct the complete sequence.

### Step 3 — Separate Variables from Constants

From the evidence gathered:

- **Variables** — parameters that change each run (client name, invoice number, date, amount, file name). These become the runbook's inputs.
- **Constants** — fixed elements (URLs, templates, field names, API endpoints, app sequences). These get hardcoded.

### Step 4 — Identify Error Points

For each step, consider:

- What can go wrong (page not loading, data missing, API error, wrong format)
- How the user currently handles failures (from evidence)
- What a reasonable fallback would be in an automated version

### Step 5 — Write the Runbook

Use the output template below. Every field must be filled — if information is unavailable, state what's unknown and what would need to be verified.

## Output Template

```markdown
# [Pattern Name] — Automation Runbook

## Overview

- **What this does**: [1-2 sentence description of the end-to-end process]
- **Trigger**: [what starts it — time-based, event-based, or manual]
- **Frequency**: [how often it occurs, based on activity evidence]
- **Estimated time per run**: [based on activity timestamps]
- **Estimated time saved per week**: [frequency × time per run]

## Prerequisites

- **Apps/services**: [list each app or service with what it's used for]
- **Access needed**: [credentials, API keys, permissions — don't include actual secrets]
- **Input data**: [what data sources feed into this process]

## Steps

### 1. [Action verb] — [what happens] in [app]

- **Details**: [exactly what to do]
- **Input**: [what data goes in]
- **Output**: [what to expect / what gets produced]
- **Error handling**: [what can go wrong and what to do]

### 2. [Action verb] — [what happens] in [app]

- **Details**: ...
- **Input**: ...
- **Output**: ...
- **Error handling**: ...

[Continue for all steps]

## What Varies Between Runs

- [Parameter 1]: [description and example values from evidence]
- [Parameter 2]: ...

These are the inputs/arguments for any automation built from this runbook.

## What Stays Constant

- [Constant 1]: [value or description]
- [Constant 2]: ...

These get hardcoded in the automation.

## Error Handling

- **[Failure mode 1]**: [how to detect] → [what to do]
- **[Failure mode 2]**: [how to detect] → [what to do]

## Automation Approach

- **Recommended method**: [API script / browser automation / CLI tool / scheduled job / etc.]
- **Key APIs or services**: [specific APIs, webhooks, or integrations to use]
- **Implementation sketch**:
```

[Pseudocode or high-level steps for the automation]

```
- **Effort estimate**: [easy / medium / hard] — [brief justification]
```

## Quality Checks

Before finalizing the runbook, verify:

1. **Completeness** — every step from trigger to completion is covered
2. **Specificity** — steps reference concrete apps, URLs, fields — not vague actions
3. **Reproducibility** — someone unfamiliar with the process could follow it
4. **Variables identified** — all changing parameters are listed, with examples
5. **Automation path clear** — the approach section gives enough detail to start building
