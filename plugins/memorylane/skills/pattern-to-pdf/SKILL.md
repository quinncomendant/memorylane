---
name: pattern-to-pdf
description: Process Description Document generator. Takes a detected pattern or user-described process and produces a downloadable PDF briefing with a visual process map, step details, occurrence stats, and improvement opportunities. Requires MemoryLane MCP tools.
---

# Process Description Document (PDD)

Turn a detected pattern into a shareable process briefing — the kind you'd hand to a new hire or paste into an ops wiki.

## The Goal

A PDD is a **process briefing document** — not a corporate BPM artifact with swim lanes and BPMN notation. It's the document you wish existed when you joined a team: "here's how we actually do X, step by step, with the apps involved, how long it takes, and what varies each time."

The pattern-detector finds _that_ a process exists. The PDD describes _how_ it works — with enough detail that someone unfamiliar could follow it, and enough structure to spot what's automatable.

```
Pattern Detector output:
  "Client Onboarding" — Email → CRM → billing → welcome email,
  3-4x/week, ~20 min each

              ↓ PDD Generator

Process Description Document:
  Executive summary — what, why, how often, how long
  At a Glance — stats bar with key metrics
  Process Map — visual flowchart showing each step
  Steps — numbered walkthrough with apps, actions, variations
  Opportunity — biggest time sink + concrete automation suggestion
```

## Input

Expects one of:

- A **pattern name/description** from the pattern-detector output (e.g., "Client Onboarding")
- A **user-described process** (e.g., "the thing I do every Monday with Stripe and Sheets")
- A **search query** if the user is vague (you'll discover the process from data)

## Data Gathering Strategy

### 1. Find All Instances

```
search_context(query="<pattern description>", startTime="30 days ago", endTime="now", limit=30)
```

Cast a wide net. Use the pattern name, key apps, and distinguishing actions as search terms. If the pattern-detector already identified specific dates, use those as anchors.

### 2. Cluster by Occurrence

Group returned activities by date proximity — activities within 60 minutes of each other likely belong to the same occurrence. Build a list of distinct occurrences with their date ranges.

### 3. Deep-Dive the Best Instances

Pick the **3–5 clearest instances** — the ones with the most steps and least noise (fewest unrelated app switches mixed in):

```
get_activity_details(ids=["id1", "id2", "id3", ...])
```

Use OCR text to understand exactly what's happening at each step — what fields are being filled, what data is being moved, what decisions are being made.

### 4. Cross-Reference for Canonical Sequence

Compare all deep-dived instances to build:

- **Canonical steps** — the steps that appear in every (or nearly every) instance, in the same order
- **Variations** — steps that differ between instances (different client names, different amounts, optional branches)
- **Decision points** — places where the process forks (e.g., "if international client → add tax form step")

### 5. Fallback: Sparse Data

If `search_context` returns fewer than 3 instances:

```
browse_timeline(startTime="<known_date> - 2 hours", endTime="<known_date> + 2 hours", limit=200, sampling="uniform")
```

Use `browse_timeline` around known occurrence dates to reconstruct the full sequence from surrounding context. Even 2 good instances can produce a useful PDD if the process is consistent.

## Document Sections

### 1. Executive Summary

3–4 sentences covering:

- **What** the process accomplishes
- **Why** it exists (what business need it serves)
- **How often** it happens (frequency from occurrence data)
- **How long** it takes (average duration from timestamps)

### 2. At a Glance

A stats bar with key metrics at a glance:

| Metric                 | Source                                               |
| ---------------------- | ---------------------------------------------------- |
| **Frequency**          | Occurrence count ÷ time window (e.g., "~3x/week")    |
| **Avg duration**       | Mean time from first to last activity per occurrence |
| **Apps involved**      | Distinct apps seen across all instances              |
| **Last seen**          | Date of most recent occurrence                       |
| **Instances observed** | How many occurrences the PDD is based on             |

### 3. Process Map

A vertical CSS flowchart — the visual centerpiece of the document.

**Design rules:**

- **Vertical flow**, top to bottom
- Each step = a styled node with an **app badge** (colored pill with app name) + **action text**
- **Connector lines** between steps (CSS borders/pseudo-elements)
- **Decision points** = distinct styled node (octagonal or highlighted border) with Yes/No branches
- **Constant steps** = solid border — these happen every time
- **Variable steps** = dashed border + annotation explaining what varies
- Steps derived from cross-instance analysis (Section 4 of Data Gathering)

**Node anatomy:**

```
┌─────────────────────────────┐
│  [App Badge]  Action text   │
│  "Enter client details"     │
└──────────────┬──────────────┘
               │
               ▼
```

**Decision node anatomy:**

```
        ┌──────────────┐
       ╱  International  ╲
      ╱    client?        ╲
      ╲                  ╱
       ╲                ╱
        └──┬────────┬──┘
       Yes │        │ No
           ▼        ▼
```

### 4. Steps

A numbered walkthrough — each step includes:

| Field           | Description                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **#**           | Step number in sequence                                                                                 |
| **App**         | Which application is used                                                                               |
| **Action**      | What the user does (specific: "Enter client name and billing address", not "Use CRM")                   |
| **What varies** | What changes between instances (e.g., "Client name, billing amount") or "Nothing — identical each time" |

### 5. Opportunity

A brief assessment:

- **Biggest time sink** — which step(s) consume the most time
- **What's automatable** — which constant steps could be scripted or API-driven
- **One concrete suggestion** — a single, actionable automation recommendation (same specificity level as pattern-detector suggestions)

## Process Map HTML Design

The process map uses pure inline CSS (no classes, no external styles). It follows the same design language as the pattern-detector template.

**Step node:**

```html
<div
  style="background: #fff; border: 2px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; max-width: 420px; margin: 0 auto;"
>
  <span
    style="display: inline-block; background: #6366f1; color: white; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 99px; margin-right: 8px;"
    >{app_name}</span
  >
  <span style="font-size: 14px; color: #1e293b;">{action_text}</span>
</div>
```

**Variable step node** (dashed border):

```html
<div
  style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 10px; padding: 14px 18px; max-width: 420px; margin: 0 auto;"
>
  <span
    style="display: inline-block; background: #f59e0b; color: white; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 99px; margin-right: 8px;"
    >{app_name}</span
  >
  <span style="font-size: 14px; color: #1e293b;">{action_text}</span>
  <div style="font-size: 12px; color: #92400e; margin-top: 6px;">Varies: {what_varies}</div>
</div>
```

**Decision node:**

```html
<div
  style="background: #f0f9ff; border: 2px solid #38bdf8; border-radius: 10px; padding: 14px 18px; max-width: 420px; margin: 0 auto; text-align: center;"
>
  <span style="font-size: 14px; font-weight: 600; color: #0369a1;">{decision_question}</span>
</div>
```

**Connector between steps:**

```html
<div style="width: 2px; height: 28px; background: #cbd5e1; margin: 0 auto;"></div>
```

**Branch connector (Yes/No):**

```html
<div style="display: flex; justify-content: center; gap: 80px; margin: 0 auto; max-width: 420px;">
  <div style="text-align: center;">
    <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 4px;">Yes</div>
    <div style="width: 2px; height: 20px; background: #10b981; margin: 0 auto;"></div>
  </div>
  <div style="text-align: center;">
    <div style="font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">No</div>
    <div style="width: 2px; height: 20px; background: #94a3b8; margin: 0 auto;"></div>
  </div>
</div>
```

## HTML Template

Replace all `{placeholders}` with actual data. The command file handles wrapping this in a full HTML document and converting to PDF — this template is just the body content.

```html
<div
  style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; color: #1a1a2e;"
>
  <!-- HEADER -->
  <div
    style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; color: white;"
  >
    <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">{process_name}</div>
    <div style="font-size: 13px; opacity: 0.85;">
      Process Description Document · Based on {instances_observed} observed instances ·
      {analysis_window}
    </div>
  </div>

  <!-- EXECUTIVE SUMMARY -->
  <div
    style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; background: #fff;"
  >
    <div style="font-size: 14px; color: #475569; line-height: 1.6;">{executive_summary}</div>
  </div>

  <!-- AT A GLANCE — STATS ROW -->
  <div style="display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">
    <div
      style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center;"
    >
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
      >
        Frequency
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #1e293b;">{frequency}</div>
    </div>
    <div
      style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center;"
    >
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
      >
        Avg Duration
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #1e293b;">{avg_duration}</div>
    </div>
    <div
      style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center;"
    >
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
      >
        Apps
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #1e293b;">{apps_involved}</div>
    </div>
    <div
      style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center;"
    >
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
      >
        Last Seen
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #1e293b;">{last_seen}</div>
    </div>
    <div
      style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center;"
    >
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
      >
        Instances
      </div>
      <div style="font-size: 16px; font-weight: 700; color: #1e293b;">{instances_observed}</div>
    </div>
  </div>

  <!-- PROCESS MAP -->
  <div
    style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 16px; background: #fff;"
  >
    <div
      style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px;"
    >
      Process Map
    </div>

    <!-- Step node — repeat and adapt for each step -->
    <div
      style="background: #fff; border: 2px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; max-width: 420px; margin: 0 auto;"
    >
      <span
        style="display: inline-block; background: #6366f1; color: white; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 99px; margin-right: 8px;"
        >{app_name}</span
      >
      <span style="font-size: 14px; color: #1e293b;">{action_text}</span>
    </div>

    <!-- Connector — between each pair of steps -->
    <div style="width: 2px; height: 28px; background: #cbd5e1; margin: 0 auto;"></div>

    <!-- Variable step node — use when step varies between instances -->
    <div
      style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 10px; padding: 14px 18px; max-width: 420px; margin: 0 auto;"
    >
      <span
        style="display: inline-block; background: #f59e0b; color: white; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 99px; margin-right: 8px;"
        >{app_name}</span
      >
      <span style="font-size: 14px; color: #1e293b;">{action_text}</span>
      <div style="font-size: 12px; color: #92400e; margin-top: 6px;">Varies: {what_varies}</div>
    </div>

    <!-- Connector -->
    <div style="width: 2px; height: 28px; background: #cbd5e1; margin: 0 auto;"></div>

    <!-- Decision node — use when process branches -->
    <div
      style="background: #f0f9ff; border: 2px solid #38bdf8; border-radius: 10px; padding: 14px 18px; max-width: 420px; margin: 0 auto; text-align: center;"
    >
      <span style="font-size: 14px; font-weight: 600; color: #0369a1;">{decision_question}</span>
    </div>

    <!-- Branch connector -->
    <div
      style="display: flex; justify-content: center; gap: 80px; margin: 0 auto; max-width: 420px;"
    >
      <div style="text-align: center;">
        <div style="font-size: 12px; font-weight: 600; color: #10b981; margin-bottom: 4px;">
          Yes
        </div>
        <div style="width: 2px; height: 20px; background: #10b981; margin: 0 auto;"></div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">No</div>
        <div style="width: 2px; height: 20px; background: #94a3b8; margin: 0 auto;"></div>
      </div>
    </div>

    <!-- END PROCESS MAP — adapt the above node types to build the actual flowchart -->
  </div>

  <!-- STEPS TABLE -->
  <div
    style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; background: #fff;"
  >
    <div
      style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;"
    >
      Steps
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0;">
          <th
            style="text-align: left; padding: 8px 12px; color: #64748b; font-weight: 600; font-size: 12px;"
          >
            #
          </th>
          <th
            style="text-align: left; padding: 8px 12px; color: #64748b; font-weight: 600; font-size: 12px;"
          >
            App
          </th>
          <th
            style="text-align: left; padding: 8px 12px; color: #64748b; font-weight: 600; font-size: 12px;"
          >
            Action
          </th>
          <th
            style="text-align: left; padding: 8px 12px; color: #64748b; font-weight: 600; font-size: 12px;"
          >
            What Varies
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- Repeat for each step -->
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 12px; color: #6366f1; font-weight: 700;">{step_number}</td>
          <td style="padding: 10px 12px;">
            <span
              style="display: inline-block; background: #f1f5f9; color: #334155; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px;"
              >{app_name}</span
            >
          </td>
          <td style="padding: 10px 12px; color: #1e293b;">{action}</td>
          <td style="padding: 10px 12px; color: #64748b; font-style: italic;">{what_varies}</td>
        </tr>
        <!-- END step row -->
      </tbody>
    </table>
  </div>

  <!-- OPPORTUNITY -->
  <div
    style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; background: #fff;"
  >
    <div style="font-size: 12px; font-weight: 600; color: #6366f1; margin-bottom: 10px;">
      Opportunity
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;">
      <div
        style="flex: 1; min-width: 200px; background: #fef3c7; border-radius: 8px; padding: 12px 16px;"
      >
        <div
          style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
        >
          Biggest time sink
        </div>
        <div style="font-size: 13px; color: #78350f;">{biggest_time_sink}</div>
      </div>
      <div
        style="flex: 1; min-width: 200px; background: #d1fae5; border-radius: 8px; padding: 12px 16px;"
      >
        <div
          style="font-size: 11px; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
        >
          Automatable
        </div>
        <div style="font-size: 13px; color: #064e3b;">{whats_automatable}</div>
      </div>
    </div>
    <div style="background: #f8fafc; border-radius: 8px; padding: 14px 16px;">
      <div
        style="font-size: 11px; color: #6366f1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
      >
        Recommended next step
      </div>
      <div style="font-size: 14px; color: #334155; line-height: 1.5;">{automation_suggestion}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div
    style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; border: 1px solid #e2e8f0;"
  >
    <div style="font-size: 13px; color: #64748b; line-height: 1.5;">
      <strong style="color: #1e293b;">Generated from screen activity data.</strong>
      This document reflects observed behavior, not self-reported processes. Steps marked as
      variable were found to differ across instances.
    </div>
  </div>
</div>
```

## Calibration Examples

These show the expected level of detail. Each example: input pattern → what the PDD should contain.

### Example 1: Client Onboarding

**Input pattern:** "Client Onboarding — Email → CRM → billing system → welcome email, 3-4x/week, ~20 min"

**Expected PDD structure:**

- **Executive summary:** "Client onboarding is a 5-step process that sets up new clients in the company's systems. It runs 3–4 times per week, triggered by a signed contract arriving via email. Average duration is 20 minutes. The process touches Gmail, HubSpot CRM, Stripe billing, and Gmail again for the welcome email."
- **Process map:** 5 nodes — (1) Gmail: Open signed contract email → (2) HubSpot: Create contact with company details [variable: client name, company, address] → (3) HubSpot: Add deal and set stage to "Won" → (4) Stripe: Create customer and subscription [variable: plan type, billing amount] → (5) Gmail: Send welcome email template [variable: recipient, personalized greeting]
- **Decision branch:** None observed — process is linear across all instances.
- **Opportunity:** Steps 2–4 are data entry of the same information into three systems. An intake form → API integration could eliminate 15 of the 20 minutes.

### Example 2: Weekly Revenue Report

**Input pattern:** "Revenue reporting — Stripe → Google Sheets → formulas → Slack, every Monday, ~35 min"

**Expected PDD structure:**

- **Executive summary:** "The weekly revenue report aggregates Stripe payment data into a formatted summary shared with the finance team via Slack. It runs every Monday morning, takes approximately 35 minutes, and involves Stripe dashboard, Google Sheets, and Slack."
- **Process map:** 6 nodes — (1) Stripe: Export last 7 days of payments as CSV → (2) Sheets: Import CSV into "Weekly Revenue" tab [constant: same spreadsheet] → (3) Sheets: Update date range in summary formulas → (4) Sheets: Review computed totals, check for anomalies [variable: time spent varies 2–15 min depending on discrepancies] → (5) Sheets: Screenshot summary table → (6) Slack: Post screenshot + commentary to #finance [variable: commentary text]
- **Decision branch:** After step 4 — "Discrepancy found?" → Yes: investigate in Stripe (adds 10–20 min) → No: continue to step 5.
- **Opportunity:** Steps 1–3 are fully automatable via Stripe API → Sheets API. A scheduled script could have the spreadsheet pre-populated by Monday morning, reducing the process to review + post (~10 min).

### Example 3: Expense Approval Batch

**Input pattern:** "Expense review — PDF open → policy check in browser → approve/reject in expense tool, 10-15 per batch, twice a week"

**Expected PDD structure:**

- **Executive summary:** "Expense approval processes 10–15 expense reports in a single sitting. It runs twice per week (typically Tuesday and Thursday), taking 30–45 minutes per batch. Each report involves reviewing the PDF, checking line items against company policy, and recording the decision."
- **Process map:** 4 nodes per report, wrapped in a "Repeat for each report" annotation — (1) Expense tool: Open next pending report → (2) Preview: Review PDF receipt/invoice [variable: vendor, amount, category] → (3) Browser: Check expense policy for category limits [variable: policy section checked] → (4) Expense tool: Approve or reject with notes [decision: "Within policy?" → Yes: approve → No: reject with reason]
- **Decision branch:** After step 3 — "Within policy limits?" → Yes: approve → No: reject with policy citation.
- **Opportunity:** Step 3 (policy lookup) is the bottleneck — different policy sections for different expense categories. A pre-check script that flags policy violations before human review would eliminate the manual lookup for ~80% of reports.
