# Verified environment (inspected 2026-08-31)

| Item | Value | Consequence |
|---|---|---|
| Workspace | `/Users/crimsonvolkov/Projects/SIH 2026` — **empty, not a git repo** | Greenfield. No reusable code. `git init` on Day 1. |
| CPU | Intel Core i7-10510U @ 1.80 GHz, 8 logical cores | 15 W mobile U-series. **No CUDA, no Apple-Silicon NPU.** Real-time DNN inference is the bottleneck. |
| Arch | `x86_64` native (not Rosetta) | See torch/mediapipe pins below. |
| RAM | 64 GB | Not a constraint. |
| **Free disk** | **7.4 GB of 249 GB** | **Hard constraint.** No torch, no node_modules bloat, cap recordings. |
| Python | 3.14.5 (default), **3.11.15** available | Build on **3.11** — CV wheels lag 3.14. |
| uv | 0.11.17 | Use `uv venv` / `uv pip` — fast, no conda. |
| Node | v24.15.0, npm 11.12.1 | Available but see frontend decision. |
| ffmpeg | 8.1.2 | Present. Covers UDP streaming + muxing. No install needed. |
| Docker | 29.5.3 | Present. **Do not use** — offline demo, disk cost, zero benefit. |
| macOS `say` | present, full en_US/en_GB/en_IN voice set | Free offline TTS fallback. |
| Camera | `[0] EMEET SmartCam C960` (USB 1080p) | Matches "fixed camera" requirement. |
| Virtual cam | `[1] OBS Virtual Camera` | **Demo insurance** — can replay a recorded perfect run as a live camera. |

## Dependency resolution facts (verified with `uv pip compile --python-platform x86_64-apple-darwin`)

| Package | Resolves to | Note |
|---|---|---|
| `opencv-python` | 5.0.0.93 | Fine. Primary CV dependency. |
| `mediapipe` | **0.10.21** (not latest) | Last x86_64-macOS wheel. Works, CPU-only. P1 tier. |
| `torch` | **2.2.2** (Mar 2024) | Last Intel-macOS wheel. PyTorch dropped x86_64 mac after this. |
| `ultralytics` | 8.4.136, dragging torch 2.2.2 | **Avoid.** Modern ultralytics against a 2-year-old torch is a live compatibility risk, plus ~2 GB on a 7.4 GB disk. |
| `onnxruntime` | 1.23.2 | Works. The correct route if a YOLO-class model is ever needed here (ONNX export, no torch). |
| `pyttsx3` | 2.99, drags **full `pyobjc` metapackage** | **Avoid** — hundreds of MB for what `say` does for free. |
| `piper-tts` | 1.7.0 + onnxruntime + model download | Avoid for MVP. Good P2 option for a truly self-contained offline binary. |

## Claude Code capabilities present
- Skills: `superpowers:*` (brainstorming, TDD, systematic-debugging, writing-plans, verification-before-completion), `frontend-design`, `artifact-design`, `code-review`, `firecrawl:*`, `dataviz`.
- MCP: claude-in-chrome (browser automation — useful for driving/screenshotting the dashboard), Gmail, Calendar, Notion, Todoist, Wispr Flow. **None needed by the product.**
- Nothing in the MCP/plugin set provides CV, TTS, or model hosting. All of that is local Python.

## Nothing needs installing beyond a project venv
`fastapi uvicorn[standard] opencv-python pyyaml pytest websockets` on Python 3.11. Total < 150 MB.
