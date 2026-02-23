# Video Stitcher Encoder Benchmark Findings

**Date:** 2026-02-23 | **Platform:** macOS (Apple Silicon) | **Scope:** v2 `FfmpegVideoStitcher` H.264 encoding CPU cost

## Summary

- `h264_videotoolbox` (mac hardware encoder) reduces **CPU seconds** substantially vs `libx264`.
- On 1080p / 20-frame (20s) activities, VideoToolbox can get stitching below **5% CPU/video**.
- Default was changed to:
  - **macOS:** `h264_videotoolbox` with target bitrate `200k` (fallback to `libx264` if hardware encode fails)
  - **Other platforms:** existing `libx264` (`preset=veryfast`, `crf=28`)

## Key Measurements (CPU = user+sys)

### App-path benchmark (real `FfmpegVideoStitcher` path)

`1920x1080`, `20` frames (`20s` video), `repeat=5`:

- **mac default (VideoToolbox, 200k target):**
  - CPU total: `3.89s` across `100s` encoded video
  - **CPU/video: `3.89%`**
  - Actual bitrate: `~148 kbps`

Reference comparison (manual x264 config used during calibration):

- `libx264`, `ultrafast`, target `200k`:
  - CPU/video: `~11.06%`
  - Actual bitrate: `~102 kbps`

### Encoder-only comparison (ffmpeg direct, fixed target bitrate)

`1920x1080`, `20` frames (`20s` video), repeat=3:

- `libx264 ultrafast`, target `200k` -> actual `~113 kbps`, **`10.40%` CPU/video**
- `h264_videotoolbox`, target `100k` -> actual `~115 kbps`, **`4.95%` CPU/video**

This shows a like-for-like bitrate comparison where VideoToolbox cuts CPU roughly in half.

## Practical Notes

- VideoToolbox uses much less CPU but often longer wall-clock time (work is offloaded to hardware blocks).
- Hardware encode can fail on some machines/builds; stitcher now falls back to `libx264` automatically.
- Actual output bitrate may differ from target and differs by encoder, so x264 and VideoToolbox targets are not directly equivalent.

## Recommendation

- Keep **VideoToolbox as the macOS default** for v2 stitching due to the large CPU reduction.
- Keep `libx264` defaults on non-macOS platforms for compatibility and predictable behavior.
