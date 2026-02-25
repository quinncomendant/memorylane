---
name: pattern-detector
description: Process mining from screen activity. Observes what users actually do — not what they say they do — to extract repeated workflows and produce process documentation. Replaces business analyst interviews with ground-truth observation. Requires MemoryLane MCP tools.
---

# Pattern Detector

Process mining from screen activity — extract real workflows, not self-reported ones.

## The Goal

Replace business analyst interviews with ground-truth observation:

```
7 days of screen activity (~400 app switches)
              ↓ Pattern Detector analyzes

Process Documentation:
1. "Client Onboarding" — Email → CRM → billing system → welcome email,
    per new client, ~20 min each, 3-4x/week
2. "Weekly Revenue Report" — Stripe → Google Sheets → formulas → Slack,
    every Monday, ~35 min
3. "Expense Approval" — PDF review → policy check in browser → approve/reject
    in expense tool, 10-15 per batch, twice a week

Each process: exact steps, frequency, what varies between runs,
what's constant, and a concrete automation path.
```

A business analyst interviews users and gets idealized descriptions. Users forget steps, omit workarounds, describe what they _think_ they do. MemoryLane captures what actually happens on screen — the real process, including:

- **Steps users don't mention** — "I always check the CRM before sending the welcome email"
- **Workarounds that became habit** — "I copy-paste from the invoice PDF because the export doesn't include tax IDs"
- **Time users underestimate** — "I spend 40 min/week just moving numbers between Stripe and Sheets"

The output is what a BA would produce after a week of shadowing — except it's derived from actual screen data, not recall.

## What You're Looking For

Not everything that repeats is a process. Checking email, switching to Slack, browsing Reddit — background behavior, not automatable work. You're looking for **goal-directed sequences**: multi-step workflows where someone is trying to accomplish a specific outcome.

### Signals

| Signal                   | Example                                           | What it suggests       |
| ------------------------ | ------------------------------------------------- | ---------------------- |
| **App-switching loops**  | Chrome (OpenRouter) → Notion → Chrome → Notion    | "Test and record" loop |
| **Semantic repetition**  | "Reviewing model X", then "Reviewing model Y"     | Evaluation loop        |
| **Cross-day recurrence** | Same workflow appearing Monday, Wednesday, Friday | Established process    |
| **Multi-step pipelines** | GitHub → Cursor → Terminal → GitHub, consistently | End-to-end workflow    |

### Noise to Ignore

- One-off occurrences (must appear **3+ times** to report)
- Background app switches (email, Slack, Reddit)
- Overly broad patterns — "uses Cursor and Chrome" is useless
- Trivial sequences — a 2-step process done twice isn't worth documenting

### Granularity

```
Too broad:  "writes code in Cursor"
Just right: "edits hero.tsx → Chrome preview → Cursor → CSS tweak → preview again"
Too narrow: "pressed Cmd+S in Cursor at 2:47pm"
```

The sweet spot: specific enough to write an automation for, general enough to be a repeatable process.

## Data Layer

Three MCP tools, used in sequence — scan, confirm, zoom in:

**`browse_timeline`** — The scanner. Compact one-line summaries of app switches.

```
browse_timeline(startTime="today", endTime="now", limit=200, sampling="uniform")
```

- Each activity = one app switch (new app or context comes into focus)
- Typical density: 40–100 activities/day
- Response header shows `"Showing X of Y activities"` when results are sampled
- **Always scan one day at a time with `limit=200`** (see Scanning Strategy)

**`search_context`** — The confirmer. Semantic search across all recorded activity.

```
search_context(query="reviewing models on OpenRouter", startTime="30 days ago", endTime="now", limit=20)
```

- Use after spotting a candidate pattern to verify it across a wider window
- Returns: id, time, app, AI summary

**`get_activity_details`** — The microscope. Full details including raw OCR screen text.

```
get_activity_details(ids=["id1", "id2", "id3"])
```

- Use sparingly — only for high-confidence candidates where exact screen content matters
- OCR reveals what was actually on screen (crucial for specific automation suggestions)
- **Privacy**: never reproduce passwords, API keys, or personal messages from OCR

## Scanning Strategy

Pattern detection requires **sequential context** — the order of app switches within a day reveals the loops. A single `browse_timeline` across 7 days with `limit=50` yields ~7 entries/day after uniform sampling, destroying this sequential context.

**Iterate day by day**, analyze each batch, maintain a running candidate list:

```
Day 0 (today):
  browse_timeline(startTime="today", endTime="now", limit=200, sampling="uniform")
  → Analyze batch, extract candidates

Day 1 (yesterday):
  browse_timeline(startTime="2 days ago", endTime="1 day ago", limit=200, sampling="uniform")
  → Analyze batch, merge with existing candidates

Day 2:
  browse_timeline(startTime="3 days ago", endTime="2 days ago", limit=200, sampling="uniform")
  → Cross-reference — patterns on multiple days get higher confidence

... continue for at least 7 days
```

**Bail-out rules:**

- < 10 total activities after 7 days → extend to 14 days
- < 5 total activities after 14 days → not enough data, tell the user

**Intra-day deep dives** (when you spot a suspicious cluster):

```
browse_timeline(startTime="4 hours ago", endTime="now", limit=200, sampling="uniform")
```

## Analysis Per Batch

For each day's data, apply this reasoning structure:

```
STEP 1 — App frequency
Which apps appear most? What pairs appear together?

STEP 2 — Semantic clustering
Group activities by what they describe. Are there clusters of similar descriptions?

STEP 3 — Temporal sequences
Within each cluster, do activities follow a consistent order?

STEP 4 — Repetition detection
For each sequence, does it repeat? How many times? Over what time span?

STEP 5 — Variation analysis
Within repeated sequences, what changes between iterations? What stays the same?

STEP 6 — Automation assessment
For the "stays the same" parts — can these be scripted, scheduled, or API-driven?
```

After each day, merge new candidates with the running list. A pattern spotted on day 3 that also appeared on day 1 is stronger — increase its confidence.

## Confirming Candidates

For each candidate with 3+ occurrences:

1. **Widen the window** — `search_context(query)` with pattern-specific queries to check the full 30-day history. Does it hold up beyond the 7-day scan?
2. **Zoom into details** — `get_activity_details(ids)` only for high-confidence candidates where the OCR text would reveal specifics needed for the automation suggestion. Keep this to a minimum.

## Output

Render results as inline HTML. Rank patterns by **automation impact** — frequency × time per loop × ease of automation.

### HTML Template

Output this directly in your response. Repeat the pattern card block for each detected pattern.

```html
<div
  style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; color: #1a1a2e;"
>
  <!-- HEADER -->
  <div
    style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; color: white;"
  >
    <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Pattern Report</div>
    <div style="font-size: 13px; opacity: 0.85;">
      {analysis_window} · {total_activities_analyzed} activities analyzed · {pattern_count} patterns
      found
    </div>
  </div>

  <!-- PATTERN CARD — repeat for each pattern -->
  <div
    style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; background: #fff;"
  >
    <div style="margin-bottom: 12px;">
      <span style="font-size: 16px; font-weight: 600; color: #1a1a2e;">{pattern_name}</span>
    </div>
    <div style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 14px;">
      {description}
    </div>

    <!-- STATS ROW -->
    <div style="display: flex; gap: 24px; margin-bottom: 14px; flex-wrap: wrap;">
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Frequency
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1e293b;">{frequency}</div>
      </div>
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Time per loop
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1e293b;">{time_per_loop}</div>
      </div>
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Apps
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1e293b;">{apps_involved}</div>
      </div>
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Effort to automate
        </div>
        <div style="font-size: 14px; font-weight: 600; color: {effort_color};">{effort}</div>
      </div>
    </div>

    <!-- LOOP STRUCTURE -->
    <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;"
      >
        Loop structure
      </div>
      <div
        style="font-size: 13px; color: #334155; font-family: 'SF Mono', Monaco, Consolas, monospace;"
      >
        {loop_structure}
      </div>
    </div>

    <!-- WHAT VARIES vs WHAT'S CONSTANT -->
    <div style="display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;">
      <div
        style="flex: 1; min-width: 200px; background: #fef3c7; border-radius: 8px; padding: 12px 16px;"
      >
        <div
          style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
        >
          What varies
        </div>
        <div style="font-size: 13px; color: #78350f;">{what_varies}</div>
      </div>
      <div
        style="flex: 1; min-width: 200px; background: #d1fae5; border-radius: 8px; padding: 12px 16px;"
      >
        <div
          style="font-size: 11px; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
        >
          What's constant
        </div>
        <div style="font-size: 13px; color: #064e3b;">{what_stays_constant}</div>
      </div>
    </div>

    <!-- AUTOMATION SUGGESTION -->
    <div style="border-top: 1px solid #e2e8f0; padding-top: 14px;">
      <div style="font-size: 12px; font-weight: 600; color: #6366f1; margin-bottom: 6px;">
        Automation suggestion
      </div>
      <div style="font-size: 14px; color: #334155; line-height: 1.5;">{automation_approach}</div>
    </div>
  </div>
  <!-- END PATTERN CARD -->

  <!-- SUMMARY FOOTER -->
  <div
    style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; border: 1px solid #e2e8f0;"
  >
    <div style="font-size: 13px; color: #64748b; line-height: 1.5;">
      <strong style="color: #1e293b;">Estimated total time savings:</strong> {total_time_savings}
      per week if all suggested automations are implemented.
    </div>
  </div>
</div>
```

### Color Mappings

**Effort colors** for `{effort_color}`:

| Effort | Color             |
| ------ | ----------------- |
| Easy   | `#10b981` (green) |
| Medium | `#f59e0b` (amber) |
| Hard   | `#ef4444` (red)   |

## Calibration Examples

These show the level of specificity to aim for. Each example: observable screen behavior → concrete automation suggestion.

### Engineering & Product

1. User tests 8 AI models one by one on OpenRouter, recording results in Notion after each test. → Batch API script that runs all models and generates a comparison table.

2. User makes small CSS changes, previews in browser, adjusts, previews again, sometimes discards everything. → Component playground or hot-reload setup.

3. User scrapes GitHub stargazers, cleans data in Sheets, imports to email tool, writes personalized emails with Claude. → End-to-end script from repo URL to campaign launch.

4. User opens Datadog dashboard 4–5 times/day to check error rates after a deploy. → Slack alert triggered by error rate threshold, with auto-rollback on spike.

### Finance & Accounting

5. User downloads bank statement CSV, opens QuickBooks, manually enters each transaction, cross-references against invoices in Google Drive. Every Monday morning, ~45 min. → Bank feed integration with auto-matching rules.

6. User pulls revenue numbers from Stripe dashboard, copies into a Google Sheet, applies formulas, then pastes the summary into a Slack channel for the weekly finance update. → Scheduled script that queries Stripe API, computes metrics, posts to Slack.

7. User checks 3 different currency exchange rate sites before processing international vendor payments, copies rates into a spreadsheet to compare. → API-based rate aggregator that auto-selects best rate at payment time.

8. User reviews each expense report by opening the PDF, checking line items against policy in a separate browser tab, then entering approval/rejection in the expense tool. 10–15 reports per batch. → Policy-checking script that pre-flags violations, surfaces only exceptions for human review.

### Operations & Back-Office

9. User receives client onboarding forms via email, manually copies fields (name, company, billing address, tax ID) into CRM, then into billing system, then sends a welcome email template with the same details. Per new client, ~20 min. → Intake form that auto-populates CRM + billing via API, triggers welcome email.

10. User checks Zendesk queue every 2 hours, scans for high-priority tickets, copies ticket summaries into a Slack channel for the ops team. → Webhook that auto-posts P0/P1 tickets to Slack with summary and link.

11. User exports weekly sales data from CRM, imports into Excel, builds a pivot table, screenshots the chart, pastes into a PowerPoint slide deck for the Monday review. Every Friday, ~1 hour. → Automated report generation from CRM API to formatted slides.

12. User checks LinkedIn, Crunchbase, and the company website before every sales call to build a prospect brief in Notion. 3–5 calls/day, ~10 min each. → Enrichment script that auto-generates prospect briefs from company domain.

### HR & Compliance

13. User receives signed offer letters via DocuSign, downloads PDF, enters start date + salary + role into HRIS, then creates accounts in Slack + Google Workspace + Jira. Per new hire, ~30 min. → Webhook on DocuSign completion triggers HRIS entry + account provisioning.

14. User opens the compliance training dashboard weekly to check which employees haven't completed required training, then sends individual reminder emails. → Scheduled check with auto-reminder emails for overdue training.
