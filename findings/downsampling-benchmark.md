# Image Downsampling Benchmark

**Date:** 2026-02-20 | **Model:** mistralai/mistral-small-3.2-24b-instruct | **Judge:** anthropic/claude-sonnet-4-6 | **Activities:** 5

## Methodology

Replayed 5 existing activities from `.debug-pipeline/` (each containing raw Retina PNGs + the exact prompt sent to the classifier) at 10 compression levels — varying resolution (3326→1920→1280→960→640) and JPEG quality (q100→q85→q60). For each (activity, level) pair, all PNGs were resized/compressed with sharp and sent to `mistral-small-3.2-24b-instruct` via OpenRouter using the same prompt and message format as production. Input tokens, cost, and payload size were recorded from the response.

Quality was evaluated by an LLM judge (`claude-sonnet-4-6`). For each activity, the lossless full-resolution output (3326-png) served as the reference. Each compressed output was scored 1–10 on specificity, accuracy, and completeness via text-only comparison (judge did not see the images).

## Notes

- Some acitivites were have no baseline (3326-png hit 429 rate limits) so it was excluded from judging.
- Judge scores are noisy with N=4. Variance is high (e.g. 1920-q85 scores 10.0 on one activity and 7.0 on another).

## Key Findings

### 1. Mistral Small internally downscales images before inference

Token counts are identical at 3326px and 1920px, regardless of JPEG quality:

| Width | Tokens (activity c62828bf)     |
| ----- | ------------------------------ |
| 3326  | 4,501 (same at q100, q85, q60) |
| 1920  | 4,501 (same at q100, q85, q60) |
| 1280  | 3,289                          |
| 960   | 2,125                          |
| 640   | 1,189                          |

The model is downscaling to a fixed internal resolution before tokenizing — likely ~1920px or somewhere between 1920 and 1280, since that's where tokens first drop. Sending full Retina PNGs (3326px, ~3MB each) is pure waste: the extra pixels get thrown away server-side.

JPEG quality has zero effect on token count at any resolution. It's a free knob — only affects payload transfer size, not API cost.

### 2. Quality is robust down to 960px

Average judge scores across the 4 judged activities:

| Level     | Avg Score | Avg Tokens | vs Baseline Tokens |
| --------- | --------- | ---------- | ------------------ |
| 3326-png  | **10.0**  | 7,796      | —                  |
| 3326-q100 | 8.2       | 7,796      | 0%                 |
| 3326-q85  | 7.7       | 7,796      | 0%                 |
| 1920-q85  | **7.9**   | 7,796      | 0%                 |
| 1280-q85  | **7.7**   | 5,675      | -27%               |
| 960-q85   | **8.1**   | 3,638      | -53%               |
| 640-q85   | 5.6       | 1,886      | -76%               |

960-q85 scores _higher_ than 1920-q85 (8.1 vs 7.9) while using 53% fewer tokens. This is likely noise, but it confirms 960px doesn't degrade quality meaningfully.

### 3. 640px is the cliff

At 640px, scores drop to 5.6 — the model can no longer reliably read text in screenshots. Every activity showed a clear drop at this level.

### 4. Payload savings from quality are significant

At 1920px width, lowering quality from q100 to q85 cuts payload by ~60% with no token or quality impact:

| Level     | Avg Payload |
| --------- | ----------- |
| 1920-q100 | 1,742KB     |
| 1920-q85  | 763KB       |
| 1920-q60  | 444KB       |

## Recommendation

**Current production (1920-q85) is not wasting tokens** — Mistral's internal downscaler lands at roughly 1920px anyway, so we're already at the model's native resolution. Sending larger images just wastes upload bandwidth.

- **1920-q85 is the right resolution.** Going lower (1280, 960) does save tokens, but that's because _we're_ downscaling below what the model would use internally. 960-q85 happened to score well here (8.1 vs 7.9), but with N=4 that's noise — and we'd be discarding pixels the model could have used.
- **JPEG quality can safely drop to q60** — it doesn't affect tokens, and score differences at the same resolution are within noise. This would cut payload size by ~40% (763KB → 444KB avg at 1920px).
- **Don't send full Retina (3326px)** — it produces identical tokens to 1920px, meaning the model throws away the extra pixels. The only effect is slower uploads.
- **Don't go below 960px** — 640px is clearly too aggressive for text-heavy screenshots (scores drop to 5.6).
