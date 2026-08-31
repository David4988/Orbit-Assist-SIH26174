# ORBIT ASSIST

**Onboard procedural intelligence for scientific operations**

A proof-of-concept for **SIH26174 — AI Human Activity Recognition for On-board
BAS Experiments** (ISRO, Smart India Hackathon 2026).

Communication delays and restricted bandwidth make continuous ground-side
supervision of onboard experiments impractical. ORBIT ASSIST watches a fixed
payload camera, validates each observed action against a predefined procedure,
guides the operator by voice, and records a timestamped experiment log — all
running locally and offline.

---

## What is real, and what is simulated

This is an ideation prototype, and it is explicit about that distinction.

**Genuinely implemented**

- Deterministic procedure engine — sequence validation with six classification rules
- Detection of skipped steps, wrong objects, wrong actions and unrecognised actions
- Recovery tracking, including steps completed out of order
- Next-step guidance and spoken alerts
- Timestamped experiment log in text and JSON
- Full-state WebSocket dashboard

**Simulated for this proof of concept**

- **Perception.** Action events come from a scripted scenario, not from video analysis.
- The feed is a recorded video, not an interpreted one.
- Confidence values are authored, not measured.
- **No model has been trained and no accuracy has been measured.**

The perception layer emits the same structured `ActionEvent` a real pipeline
would produce, so object detection, hand-object interaction and temporal
activity recognition can replace it without changing the procedural validation,
guidance or logging demonstrated here.

---

## Running it

Requires Python 3.11+ and Node 18+. No network access is needed at runtime.

    ./run.sh

Then open <http://127.0.0.1:8000>.

For frontend development with hot reload, run the API and Vite separately:

    .venv/bin/python -m uvicorn backend.main:app --port 8000
    cd frontend && npm run dev      # http://localhost:5173

Tests:

    .venv/bin/python -m pytest tests/ -q

---

## Demo

Press **Start experiment**. The scenario in `scenarios/demo_master.json` plays
out over roughly 75 seconds and exercises every beat:

| Time | Beat |
|------|------|
| 0:04 | Step 1 completed |
| 0:14 | **Wrong object** — the blue distractor is picked up |
| 0:24 | Recovery |
| 0:34 | Step 3 completed |
| 0:46 | **Skipped step** — the yellow box is placed before it is picked up |
| 0:58 | **Late recovery** — the skipped step is repaired and turns green |
| 1:12 | Completion, summary and generated log |

Pause and Resume are driven live from the controls. Press <kbd>`</kbd> to open
the operator console and inject any action manually — useful for questions.

The recorded feed is not committed. See [`media/README.md`](media/README.md);
the app runs without it.

---

## Architecture

```
scenario / manual trigger
          ↓
     perception.py      "What did I observe?"        (simulated)
          ↓  ActionEvent { action, confidence, timestamp }
      engine.py         "Was that correct here?"     (real, deterministic)
          ↓  Decision
     guidance.py        "What should I say now?"     (real)
          ↓
   log.py  ·  WebSocket  ·  React dashboard
```

The engine is pure — no I/O, no wall clock, no framework imports — which is why
it can be verified by six fast tests and why the demo's correctness never
depends on the video.

**The video element is the master clock.** The frontend reports
`video.currentTime` over the WebSocket; the backend advances the scenario and
engine to that position. Observed actions therefore always line up with what is
on screen, and pausing the video stops the run without any separate pause logic.

| Prototype | Production system |
|---|---|
| `perception.py` replays a scenario | CV pipeline: detection, hand-object interaction, temporal model |
| `media/experiment.mp4` | fixed payload camera |
| video playback position | frame timestamps |
| local WebSocket to the dashboard | same, plus an encoder branch for IP streaming and local storage |
| `engine.py` | **unchanged** — this is the point |

### Layout

```
backend/      models · experiment · engine · perception · guidance · log · main
experiments/  step definitions (see note below)
scenarios/    six scripted scenarios; demo_master.json drives the demo
frontend/     React + Vite + Framer Motion
media/        recorded experiment feed (not committed)
runs/         generated logs, one directory per run
tests/        six engine tests
docs/         problem statement, environment notes, plan
```

---

## Note on the experiment definition

ISRO's published sample experiment is **truncated on the public SIH portal**
after *"You are given a box that contains two smaller boxes of color red and
yello"*. Only the outer box and the red and yellow boxes are confirmed.

The six-step sequence in `backend/experiment.py` is therefore a **PoC
representation**, not the official sequence, and is labelled as such in the
application. It is kept as data in one file so the real sequence can replace it
without touching the engine, the scenarios or the interface.

See [`docs/SIH26174-problem-statement.md`](docs/SIH26174-problem-statement.md)
for the verbatim problem statement text.
