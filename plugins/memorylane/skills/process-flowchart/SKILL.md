---
name: process-flowchart
description: >
  Generate clean, minimal vertical process flowcharts as SVG and JPEG from any
  workflow, pattern, or step-by-step process. Use this skill whenever the user
  asks to visualize a process, create a flowchart, diagram a workflow, map out
  steps, or turn a pattern into a visual. Also trigger when the user says things
  like "draw this process", "make a flowchart", "visualize these steps",
  "diagram this workflow", "process map", or references any multi-step procedure
  they want rendered visually. If a MemoryLane pattern is involved, use this
  skill to render it. Always produces both SVG and JPEG.
---

# Process Flowchart Generator

Generate swimlane process flowcharts in the **Taskmole house style**: clean, minimal, uniform light lanes with pastel-colored cards, white background.

## Visual Style

### Layout: Swimlane Columns

The default layout is **vertical swimlane columns** — one column per app/tool category. Steps are placed in their category's lane and connected by arrows that route across lanes.

- **Canvas**: Width scales with lane count (`MARGIN * 2 + N_LANES * 224 + (N_LANES - 1) * 10`), height scales with step count
- **Lane width**: 224px per lane, 10px gap between lanes, 54px left/right margin
- **Lane backgrounds**: All lanes use the **same** uniform light fill: `#f1f5f9` at `opacity="0.45"`. No per-lane colors — keep it non-intrusive.
- **Lane headers**: Italic `Georgia, serif` at 13px, `fill="#64748b"`, font-weight 600, centered at the top of each lane
- **Lane separators**: Dashed vertical lines (`stroke="#e2e8f0"`, `stroke-dasharray="4,4"`, `opacity="0.6"`)

### Cards

- **Size**: 206×72px rounded rectangles (`rx="14"`)
- **Centered** within their lane column
- **Typography**: Titles in `Helvetica, Arial, sans-serif` at **13px bold**. Subtitles at **10px regular**. Variable badge at **9px italic**.

#### CRITICAL — Text Overflow Prevention

This is the single most important layout rule. Text that overflows the card boundary looks broken.

- **Titles**: max **20 characters**
- **Subtitles**: max **28 characters**
- **Decision text**: max **22 characters**

If the source text is longer, **shorten it aggressively**:

- "Review debt tranche sheet" → "Review debt tranche"
- "Current outstanding balances dashboard" → "Balances dashboard"
- "Weekly finance meeting scheduled?" → "Finance meeting?"
- "Cross-reference metrics against dashboard" → "Cross-ref metrics"

### Card Colors (by category)

Cards are colored by category to pop against the uniform lane background:

| Category     | Card Fill | Title Color | Subtitle Color |
| ------------ | --------- | ----------- | -------------- |
| Video call   | `#fef9c3` | `#713f12`   | `#a16207`      |
| AI notetaker | `#d8d0e8` | `#1a1a2e`   | `#3b3666`      |
| CRM          | `#d4edda` | `#14352a`   | `#276749`      |
| Task manager | `#f5d5cc` | `#6b2020`   | `#8b4040`      |
| Manual       | `#fef3c7` | `#78350f`   | `#92400e`      |
| Email        | `#dbeafe` | `#1e3a5f`   | `#2563eb`      |
| Slack        | `#e8d5f5` | `#4a1d6e`   | `#6b3fa0`      |
| Database     | `#cce5ff` | `#003366`   | `#0055aa`      |
| API          | `#d1fae5` | `#064e3b`   | `#047857`      |
| Spreadsheet  | `#fce7f3` | `#831843`   | `#be185d`      |
| Calendar     | `#fef9c3` | `#713f12`   | `#a16207`      |
| Browser      | `#e0e7ff` | `#312e81`   | `#4338ca`      |
| File nav     | `#e0e7ff` | `#312e81`   | `#4338ca`      |
| Accounting   | `#fef3c7` | `#78350f`   | `#92400e`      |
| Analytics    | `#d1fae5` | `#064e3b`   | `#047857`      |
| Design       | `#ffe4e6` | `#881337`   | `#be123c`      |
| Code         | `#f0fdf4` | `#14532d`   | `#166534`      |
| Other        | `#f3f4f6` | `#1f2937`   | `#4b5563`      |

Unknown categories get a deterministic color from a fallback cycle.

### Special Node Types

**Variable steps** (what changes each time the process runs):

- Card fill: `#fffbeb`
- Border: `2px dashed #f59e0b`
- Extra line below subtitle: `"varies each month"` in 9px italic `#92400e`

**Decision nodes** (process branches):

- Diamond shape (SVG `<polygon>`)
- Fill: `#f0f9ff`, stroke: `2px solid #38bdf8`
- Text: 13px bold `#0369a1`
- Yes branch: `#10b981` solid connector with arrow
- No branch: `#94a3b8` dashed connector (`stroke-dasharray="6,3"`)

**Constant steps** (identical every time):

- Normal card fill per category
- Border: `2px solid #cbd5e1`

### Connectors

- **Same-lane** (vertical): straight `<line>` with arrowhead marker
- **Cross-lane**: L-shaped `<path>` — down from source, horizontal to target lane, down to target card
- **Decision Yes**: route right from diamond tip, L-shape to target
- **Decision No**: route left from diamond tip, down along inside-left edge of first lane (`MARGIN + 16`), then right to rejoin target card's left edge
- **Arrow color**: `#6b7280`
- **Arrow marker**: `<marker>` with 8×6px triangle fill `#6b7280`
- **Stroke width**: 1.5px

### Row Spacing

- 110px vertical gap between step rows
- Lane headers at y=60 from top
- First step card at y=98

### Legend

Bottom of the canvas, three items:

1. Small solid-border square + "Constant step"
2. Small dashed amber-border square + "Variable step"
3. Small diamond + "Decision point"

Font: Helvetica 11px, fill `#6b7280`

## How to Build

### Step 1: Determine Lanes

Collect all unique categories from the steps (skip `None` for decision nodes). Each unique category becomes one lane, ordered left-to-right by first appearance in the process.

### Step 2: Structure Steps as Data

Build a list of steps, each with:

```python
(lane_id, title, subtitle, is_variable, is_decision)
# Decision nodes use lane_id = None
```

**Enforce text limits before rendering:**

- `title`: max 20 chars
- `subtitle`: max 28 chars
- `decision text`: max 22 chars
- XML-escape `&` → `&amp;`, `'` → `&apos;`, `<` → `&lt;`

### Step 3: Generate SVG with Python

Write a Python script that:

1. Calculates canvas dimensions from lane count and step count
2. Defines arrowhead `<marker>` in `<defs>`
3. Renders lane background rects (uniform `#f1f5f9`), header text, dashed separators
4. Renders each step card in its lane at the correct row position
5. Connects steps with arrows (same-lane = vertical line, cross-lane = L-shaped path)
6. Handles decision branching (Yes/No diamond with two exit paths)
7. Adds legend at bottom

**Key position helpers:**

```python
def lane_x(lane_id):
    """Center-x of a lane."""
    idx = lane_index[lane_id]
    return MARGIN + idx * (LANE_W + LANE_GAP) + LANE_W // 2

def row_y(row):
    """Top-y of a card at the given row."""
    return TOP_PAD + HEADER_H + 20 + row * ROW_H
```

### Step 4: Convert SVG to JPEG

**Use the weasyprint → pdftoppm pipeline.** This produces pixel-identical output to the SVG:

```python
import weasyprint, re
from pdf2image import convert_from_path

with open("flowchart.svg") as f:
    svg = f.read()

w = int(re.search(r'width="(\d+)"', svg).group(1))
h = int(re.search(r'height="(\d+)"', svg).group(1))

html = f"""<!DOCTYPE html><html><head>
<style>
@page {{ size: {w}px {h}px; margin: 0; }}
body {{ margin: 0; padding: 0; background: white; }}
</style></head><body>{svg}</body></html>"""

weasyprint.HTML(string=html).write_pdf("/tmp/fc.pdf")
images = convert_from_path("/tmp/fc.pdf", dpi=200)
images[0].save("flowchart.jpg", "JPEG", quality=95)
```

**DO NOT use** `cairosvg` or `ImageMagick convert` for SVG → JPEG. They render fonts with different metrics than browsers and produce mismatched output. The weasyprint → pdftoppm pipeline matches the SVG exactly.

**Dependencies** (install once if missing):

```bash
pip install weasyprint pdf2image --break-system-packages
```

`pdftoppm` (from `poppler-utils`) must also be available — it usually is.

## Anonymization (share-safe mode)

Flowcharts are often shared publicly. By default, **always anonymize** sensitive information:

1. Replace real company/client names with generic labels: "Client A", "Entity B", "Partner C"
2. Replace real person names with roles: "CFO", "Account Manager", "Contact"
3. Replace specific product names with categories: "Accounting platform" not "Xero", "Analytics tool" not "Mixpanel" — unless the tool name is generic enough to be safe (e.g., "Google Sheets", "Slack")
4. Strip account numbers, IDs, and internal project codes
5. Scrub email addresses, URLs, ABNs, phone numbers, IP addresses

The goal: someone who sees the flowchart should understand the _process_ without being able to identify the _client_.

## Extracting Steps from User Input

When the user gives you a process (as bullet points, a paragraph, or a MemoryLane pattern), parse it into the step structure:

1. **Title**: Short imperative or noun phrase (2–5 words, **max 20 chars**)
2. **Subtitle**: One-line clarification (**max 28 chars**, or empty)
3. **Category**: The tool/platform/context. Match to the palette above. If unspecified, infer from context.
4. **Variable?**: Does this step change between instances?
5. **Decision?**: Does the process fork here?

## Output

Always deliver both files to the user:

- `{name}.svg` — scalable, white background, suitable for embedding
- `{name}.jpg` — rasterized at 200 DPI, white background, pixel-matched to SVG via weasyprint pipeline
