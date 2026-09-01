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
- Next-step guidance and spoken alerts (browser speech synthesis)
- Timestamped experiment log in text and JSON
- Full-state WebSocket dashboard
- **Demo Replay with canvas fallback** — animated lab-bench scene when no MP4 is present
- **Live Hand mode** — real local webcam + real hand tracking (MediaPipe's pretrained
  Hand Landmarker, running entirely in the browser) driving a genuine pinch-and-drag
  interaction with a virtual scene; see below

**Simulated / not yet built**

- **Demo Replay's perception.** Action events come from a scripted scenario, not
  from video analysis. The canvas replay is a deterministic animation, not a recording.
- **Live Hand's objects are virtual.** Their position is known by the app, not
  perceived from the image — there is no object-detection model. Only the hand
  itself is genuinely tracked.
- No temporal action-recognition model exists — "what happened" is decided by
  pinch state + point-in-shape geometry, not learned.
- Demo Replay's confidence is authored; Live Hand's is computed from tracking
  quality (pinch margin, hit-test margin), but **no accuracy has been formally
  measured** for either mode.
- No physical-object perception (colour segmentation, fiducial markers, or a
  trained detector) has been built yet — see `docs/PERCEPTION-PLAN.md`.

Perception — scripted or hand-tracked — emits the same structured `ActionEvent`
a future pipeline would produce, so physical-object detection, hand-object
interaction and temporal activity recognition can replace this layer without
changing the procedural validation, guidance or logging demonstrated here.

---

## Running it

Requires Python 3.11+ and Node 18+. Network access is needed once, on first
run, to install dependencies and vendor the ~16 MB hand-tracking runtime and
model (`tools/vendor_mediapipe.sh`, called automatically by `run.sh`). After
that, no network access is needed — verified with Wi-Fi disabled.

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

### Feed modes

The experiment feed panel has two modes, selectable at the top of the feed column.
**Switching is disabled once a run is in progress** — reset first. This is
deliberate: the two modes drive the procedure engine from genuinely different
event sources, and letting them run concurrently mid-experiment is exactly the
kind of competing-timeline bug this design avoids by construction.

**Demo Replay** (default) — `PERCEPTION · SIMULATED`
: Uses `media/experiment.mp4` if present, otherwise renders an animated
  canvas scene — a lab bench with the container, coloured boxes and a hand
  cursor. The scene is a pure function of the scenario's own beats (fetched
  from `/api/scenario/demo_master`), not a parallel hand-authored timeline:
  the hand arrives at each action's target exactly as that event fires, so
  the picture, the event, the procedure UI and the spoken guidance always
  describe the same action (`frontend/src/components/demoScene.js`).
  The video's `currentTime`
  (or wall clock when using the canvas) is the master clock: the backend's
  `Session` runs in `mode="scripted"`, and every clock tick advances
  `scenarios/demo_master.json` directly.

**Live Hand** — `PERCEPTION · HAND TRACKING`
: Opens the device's camera via `getUserMedia` and runs MediaPipe's pretrained
  Hand Landmarker against it, entirely client-side. Reach toward a virtual box,
  pinch to grab it, drag it to a marker, release to place it — each of those
  produces a real `ActionEvent` (`source: "hand"`) posted to `POST /api/event`.
  The backend runs in `mode="live"`: the clock only drives the elapsed-time
  display, and the scripted scenario **never fires** — the procedure engine
  sees nothing but real interaction. If camera permission is denied or the
  model fails to load, the UI explains why and offers Demo Replay as one click.

Every demo beat — correct step, wrong object, wrong action, skipped step, late
recovery — falls out of plain pinch-and-drag with no special-casing: wrong
object is grabbing the blue box; wrong action is dropping red, then picking it
up again before placing it; skip is doing yellow before red; recovery is going
back for red afterward. See `frontend/src/perception/interaction.js`.

The recorded feed (`media/experiment.mp4`) and the vendored MediaPipe runtime
are not committed — see [`media/README.md`](media/README.md) and
`tools/vendor_mediapipe.sh`. The app runs without either; Demo Replay falls back
to the canvas animation, and `run.sh` vendors the hand-tracking assets
automatically on first run.

---

## Architecture

```
Demo Replay:  scenario.json / manual trigger ─┐
Live Hand:    pinch-and-drag (browser) ───────┤
                                              ↓
                                       POST /api/event
                                              ↓  ActionEvent { action, confidence, timestamp, source }
                                       engine.py         "Was that correct here?"   (real, deterministic)
                                              ↓  Decision
                                       guidance.py        "What should I say now?"  (real)
                                              ↓
                                   log.py  ·  WebSocket  ·  React dashboard
```

```
Live Hand, entirely client-side (docs/PERCEPTION-PLAN.md Phase 1-2)
──────────────────────────────────────────────────────────────────
getUserMedia ──► handTracker.js ──► pinch.js ──► interaction.js ──► POST /api/event
 (real camera)   MediaPipe Hand      hysteresis +   the ONLY module     source: "hand"
                 Landmarker,         3-frame         allowed to emit
                 pretrained,         debounce         an ActionEvent
                 CPU, offline
                                        scene.js — known virtual object/zone
                                        geometry (hit-testing only; no CV)
```

```
Backend clock isolation (backend/main.py Session)
──────────────────────────────────────────────────────────────────
mode="scripted"  →  clock tick advances scenarios/demo_master.json directly
mode="live"      →  clock tick updates only the elapsed-time display;
                     the scripted scenario never fires — every event comes
                     from POST /api/event (Live Hand) or the operator console
```

The engine is pure — no I/O, no wall clock, no framework imports — which is why
it can be verified by six fast tests and why the demo's correctness never
depends on the video or camera. Live Hand and Demo Replay are mutually
exclusive per run (the feed-mode toggle disables once running) specifically so
the engine only ever sees one coherent event source at a time.

| Prototype | Production system |
|---|---|
| `perception.py` replays a scenario | — |
| **`interaction.js` + real MediaPipe hand tracking** | **already the real thing** for hand tracking; object perception is next |
| virtual box/zone coordinates (`scene.js`) | colour segmentation, fiducials, or a trained detector on physical boxes |
| canvas animation / `media/experiment.mp4` | fixed payload camera |
| local WebSocket to the dashboard | same, plus an encoder branch for IP streaming and local storage |
| `engine.py` | **unchanged** — this is the point |

See [`docs/PERCEPTION-PLAN.md`](docs/PERCEPTION-PLAN.md) for the full phased
roadmap from here to physical objects and temporal action recognition.

### Layout

```
backend/      models · experiment · engine · perception · guidance · log · main
experiments/  step definitions (see note below)
scenarios/    six scripted scenarios; demo_master.json drives the demo
frontend/
  src/
    components/    Feed · demoScene · HandStage · Procedure · Timeline · EventLog · Summary · DemoPanel · About
    perception/    handTracker · pinch · scene · interaction  (Live Hand — browser-side only)
    hooks/         useSession (WebSocket) · useSpeech (browser TTS)
  public/
    mediapipe/     vendored WASM runtime (not committed — tools/vendor_mediapipe.sh)
    models/        vendored hand_landmarker.task (not committed — same script)
media/        recorded experiment feed (not committed)
runs/         generated logs, one directory per run
tests/        six engine tests
tools/        record_demo.sh · vendor_mediapipe.sh
docs/         problem statement, environment notes, plan, perception roadmap
```

### Hand tracking (Live Hand mode)

MediaPipe's pretrained Hand Landmarker (`@mediapipe/tasks-vision`), vendored
locally and run on CPU, entirely in the browser — no training, no dataset, no
network call at runtime. It returns 21 hand landmarks per frame; everything
above that is plain geometry:

- **Pinch** = thumb-to-index distance, normalized by wrist-to-middle-knuckle
  distance so it's depth- and scale-invariant, with hysteresis (close at 0.32,
  open at 0.45) and a 3-frame debounce so it doesn't flicker.
- **Hit-testing** = point-in-rect against known virtual object/zone coordinates
  (`perception/scene.js`) — no CV needed, since the objects are virtual.
- **Confidence** is genuinely computed (hand-detection score × pinch margin ×
  hit-test margin), not authored — unlike Demo Replay's scripted confidence.

Full rationale, the phased roadmap to physical objects, and why each of those
design choices was made over the alternatives: `docs/PERCEPTION-PLAN.md`.

### Voice guidance

Browser speech synthesis (`SpeechSynthesisAPI`) — no external TTS dependency.
Prefers macOS/iOS voices (Samantha, Daniel, Karen, Serena). The synthesis queue
is cancelled before each new utterance to prevent simultaneous voices.
Toggling "Voice off" flushes the queue immediately; no speech is heard
after that point.

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
