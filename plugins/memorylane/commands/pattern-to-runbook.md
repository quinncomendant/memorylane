---
allowed-tools: mcp__memorylane__browse_timeline, mcp__memorylane__search_context, mcp__memorylane__get_activity_details
description: Generate an automation runbook from a workflow pattern
---

# Pattern to Runbook

Generate a step-by-step automation runbook (`.md` file) from a workflow pattern. The pattern can come from a previous `/discover-patterns` session or be described directly by the user. The runbook follows the methodology defined in `skills/runbook-creator/SKILL.md`.

## Instructions

### Step 1 — Identify the Pattern

- **If the user described a pattern** (e.g., "the thing where I copy data from Stripe to Google Sheets every Monday"): use that description as-is. Proceed to Step 2 to find evidence.
- **If the user referenced a pattern from a previous `/discover-patterns` run**: use the pattern name and details they shared. Proceed to Step 2.
- **If no pattern was specified**: ask the user to describe the workflow they want to turn into a runbook, or suggest they run `/discover-patterns` first to find candidates.

### Step 2 — Gather Full Context

Follow the runbook-creator skill methodology to build a complete picture:

1. `search_context(query)` — search for activities matching the pattern across 30 days to find all instances.
2. `browse_timeline` — for the strongest matches, scan the surrounding timeline to capture the full workflow sequence (steps before and after the core actions).
3. `get_activity_details(ids)` — for at least 3 clear instances, extract exact steps, apps, URLs, UI elements, and data flow.

The goal is to reconstruct the complete process from trigger to completion, and to understand what varies vs. what stays the same across runs.

### Step 3 — Generate the Runbook

Using the evidence gathered, produce the runbook following the output template in `skills/runbook-creator/SKILL.md`. Ensure:

- Every step from trigger to completion is documented
- Variables (what changes between runs) and constants (what stays the same) are clearly separated
- The automation approach section gives a concrete implementation path
- Error handling covers realistic failure modes seen in the evidence

### Step 4 — Ask Where to Save

Ask the user where to save the runbook file. Suggest a default:

```
~/Desktop/runbooks/[pattern-name-slug].md
```

Where `[pattern-name-slug]` is the pattern name lowercased with spaces replaced by hyphens (e.g., "Client Onboarding" → `client-onboarding.md`).

### Step 5 — Write the File

Save the runbook to the user's chosen path. Create the directory if it doesn't exist.

### Step 6 — Present Summary

After saving, show:

- The file path where the runbook was saved
- A brief summary of what the runbook covers (pattern name, number of steps, key apps)
- Suggested next steps: review the runbook, start building the automation, or run `/pattern-to-runbook` again for another pattern

## Notes

- **Follow the skill methodology** — the analysis steps and output template live in `skills/runbook-creator/SKILL.md`. Always reference that file for the runbook structure.
- **Privacy** — OCR data from `get_activity_details` may contain sensitive information. Extract only the process-relevant details (app names, field labels, URLs). Never include passwords, API keys, or personal messages in the runbook.
- **Incomplete evidence** — if activity data doesn't cover the full process, note the gaps in the runbook and suggest what the user should verify manually.
