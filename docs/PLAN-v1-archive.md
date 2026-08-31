# SIH26174 — 3-Day Solo PoC Blueprint
**Codename: ORBIT-ASSIST** · planned 2026-08-31 · SIH deadline 20 Sep 2026

Companion docs: [`SIH26174-problem-statement.md`](./SIH26174-problem-statement.md) (verbatim official PS) ·
[`ENVIRONMENT.md`](./ENVIRONMENT.md) (verified machine + dependency facts)

---

## 1. Executive recommendation

Build a **three-tier perception architecture behind one event interface**, and spend the three days on the
parts the PS actually grades: sequence validation, guidance, voice, logging, streaming, GUI.

**The single most important framing decision:** the PS says *"design and train an AI model that recognizes and
validates the sequence."* Recognition and validation are two different problems, and only one of them is hard.
Sequence validation is a **deterministic finite state machine** and can be built completely and correctly in
half a day. Action recognition is the hard ML problem. So: build the state machine to production quality, and
put a swappable perception source in front of it.

Three perception tiers, all emitting the identical `ActionEvent`:

| Tier | Name | Real? | Built when | Role in demo |
|---|---|---|---|---|
| **T0** | `ScriptedPerception` — replays a scenario JSON on a timeline | Simulated | Day 1 | Guaranteed-reliable demo path; the engine's test harness |
| **T1** | `ManualPerception` — operator triggers events from a hidden panel / hotkeys | Simulated | Day 1 (30 min) | Live improvisation; answers "what if the panel asks for a different error?" |
| **T2** | `ColorBlobPerception` — real OpenCV HSV segmentation + hand-proximity heuristics | **Real CV** | Day 2 PM | The live "it actually sees" moment |
| T3 | MediaPipe hands / object detector / temporal model | Real ML | Post-PoC | Roadmap only |

T2 is real computer vision and it is *honest* — the sample experiment uses coloured boxes, so colour
segmentation is the appropriate classical technique, not a cheat. It runs at full frame rate on this 15 W
Intel CPU, which no DNN detector will. Getting T2 working turns "we mocked the AI" into "we have a working
classical-CV perception tier and a documented upgrade path", which is a far stronger story to a selection panel.

**Be explicit about the tier in the UI.** A `PERCEPTION: LIVE-CV / SCRIPTED` badge on the dashboard is a
credibility asset, not a weakness. Panels forgive a labelled simulation; they do not forgive an unlabelled one
that they catch.

Three decisions that fall out of the verified environment and that I am making firmly:

1. **No PyTorch, no ultralytics.** On this Intel Mac torch pins to 2.2.2 (Mar 2024) and would eat ~2 GB of the
   7.4 GB free. It buys nothing the MVP needs.
2. **No React, no build step.** Vanilla HTML/CSS/JS served by FastAPI. The dashboard has ~12 reactive fields;
   React's value at that size is negative once you count `npm install`, a Vite config, offline CDN risk, and
   disk. *Tradeoff:* no component model. There is nothing to componentise.
3. **Voice via the browser's `speechSynthesis`**, backend `say` as fallback. Zero dependencies, offline on
   macOS, and the audio comes out of the machine already showing the dashboard.

---

## 2. MVP definition

**One sentence:** ORBIT-ASSIST watches a fixed camera over a tabletop experiment, recognises each handling
action, checks it against the pre-defined procedure in real time, speaks the next step or the correction aloud,
and writes a timestamped mission log — entirely offline.

- **User:** a crew member executing a scripted payload experiment with no live ground support.
  *(Demo proxy: one person at a desk with three coloured boxes.)*
- **User problem:** procedures are long and error-prone; a skipped or out-of-order step can invalidate an
  irreplaceable experiment, and the round-trip to ask Earth is too slow or too expensive in bandwidth.
- **Core workflow:** operator presses Start → system announces step 1 → operator performs an action → system
  classifies it as correct / wrong-object / wrong-action / skip / unknown → speaks confirmation or correction →
  advances or holds → repeats → on completion writes `experiment_log.txt` and stops recording.
- **What the MVP proves:** that deterministic procedure validation, real-time guidance, voice alerting,
  logging, local recording and IP streaming can run as one offline standalone loop, with a perception layer
  that is a clean, replaceable component.
- **Intentionally simulated:** action *recognition* at tier T0/T1. Confidence scores in scripted mode are
  authored, not measured.
- **Genuinely implemented:** the procedure engine, error taxonomy, recovery logic, stall detection, guidance
  generation, TTS, log writer, camera capture, local recording, MJPEG feed, UDP stream to a configured IP, the
  dashboard, and (target) the T2 colour-blob perception tier.
- **Explicitly out of scope:** 3D HMR, pose estimation, trained temporal action models, multiple experiments,
  multi-camera, user accounts, cloud anything, any LLM.

---

## 3. Feature scope

### P0 — mandatory for the 3-day demo

| # | Feature | Purpose | Approach | Depends on | Cx | Real? |
|---|---|---|---|---|---|---|
| P0-1 | Experiment definition loader | Procedure as data, not code — lets the real ISRO sequence drop in later | YAML → dataclasses, validated on load | pyyaml | S | Real |
| P0-2 | `ActionEvent` contract | The one seam between AI and logic | frozen dataclass + JSON schema | — | S | Real |
| P0-3 | **Procedure engine (FSM)** | The product's actual intelligence | pure `(state, event) -> (state, decisions)`, no I/O, no clock | P0-1/2 | **M** | Real |
| P0-4 | Error taxonomy + recovery | Distinguishes the 4 required error classes and closes them out | classification precedence ladder (§8) | P0-3 | M | Real |
| P0-5 | Stall / pause / resume / abort | "User stopping midway" | injected clock + watchdog tick | P0-3 | S | Real |
| P0-6 | `ScriptedPerception` (T0) | Deterministic demo + engine test fixture | scenario JSON replayed on an asyncio timeline | P0-2 | S | Simulated |
| P0-7 | `ManualPerception` (T1) | Live improvisation for panel questions | hotkeys / hidden buttons → same event bus | P0-2 | S | Simulated |
| P0-8 | Guidance generator | Turns decisions into screen text + speech text | template table keyed by decision type | P0-3 | S | Real |
| P0-9 | Voice alerts | PS explicitly requires voice | WS `speak` message → browser `speechSynthesis`; queue + dedupe | P0-8 | S | Real |
| P0-10 | Structured log writer | PS explicitly requires a lightweight timestamped text file | `experiment_log.txt` (human) + `events.jsonl` (machine), streamed per event | P0-3 | S | Real |
| P0-11 | Camera capture + frame bus | One capture thread, N consumers | OpenCV `VideoCapture` thread → latest-frame slot | opencv | S | Real |
| P0-12 | Local video recording | PS requirement | `cv2.VideoWriter`, 720p, starts on Start, stops on end | P0-11 | S | Real |
| P0-13 | MJPEG feed to GUI | Live video in the browser with no WebRTC | `multipart/x-mixed-replace` endpoint, `<img src>` | P0-11 | S | Real |
| P0-14 | FastAPI backend + WebSocket | State push to the GUI | one WS broadcasting full state snapshots | fastapi | S | Real |
| P0-15 | Dashboard | PS requirement | single vanilla page, dark mission-control theme (§9) | P0-14 | **M** | Real |
| P0-16 | Start / Pause / Resume / Abort controls | Demo control + PS "stopped midway" | REST POSTs | P0-14 | S | Real |
| P0-17 | Offline standalone run | PS requirement | `run.sh` → uvicorn + static files, zero network calls | all | S | Real |
| P0-18 | Engine unit tests | The engine must be provably right | pytest, one test per scenario + taxonomy case | P0-3 | S | Real |

### P1 — only after every P0 is green

| # | Feature | Why it waits | Cx |
|---|---|---|---|
| P1-1 | **`ColorBlobPerception` (T2)** — real HSV detection of red/yellow/blue boxes, zone occupancy, hand-proximity PICK/PLACE inference | Highest-value item in the whole plan, but it can fail. Hard start Day 2 16:00, hard abandon Day 2 21:00. | **L** |
| P1-2 | HSV calibration tool (`tools/calibrate.py`) — trackbars, writes `calibration.yaml` | Prerequisite for P1-1 under the actual demo lighting | S |
| P1-3 | UDP stream to a configured IP (`ffmpeg -f mpegts udp://IP:PORT`) | PS requirement, but nothing breaks if it's demoed as a second window | S |
| P1-4 | Confidence-gated behaviour — hold below 0.55, hedge 0.55–0.75, assert above | Makes the confidence number *mean* something on screen | S |
| P1-5 | Timeline strip with per-step status chips | Big visual payoff per unit effort | S |
| P1-6 | Run index in SQLite (stdlib `sqlite3`, one table) + past-runs list | Nice, not load-bearing | S |
| P1-7 | Post-run summary card (duration, errors by class, completion %) | Strong closing demo beat | S |

### P2 — SIH-stage capabilities, explicitly not now

MediaPipe Hands for real hand-object interaction · ONNX YOLOv8n object detector via onnxruntime (no torch) ·
custom-trained temporal action classifier (TCN/GRU over pose+object features) · MediaPipe Pose · orientation-
agnostic 3D HMR · multi-experiment library with an authoring UI · RTSP/WebRTC streaming · edge deployment
(Jetson/RPi) · anomaly detection for unrecognised activity · crew-facing AR/voice-in interface.

---

## 4. Experiment definition

> ### ⚠️ Named dependency — read this first
> The official portal publishes the sample experiment **truncated at exactly 500 characters**, ending mid-word:
> *"You are given a box that contains two smaller boxes of color red and yello"*. The full step sequence is
> **not publicly available**. Verified: the string occurs 6× in the page source, identically truncated; the PS
> has no dataset link and no YouTube link.
>
> **Confirmed from ISRO:** an outer box, containing two smaller boxes, coloured **red** and **yellow**.
> **Everything below marked PROVISIONAL is my construction, not ISRO's.**
>
> **Mitigation (this is why it costs nothing):** the sequence lives in
> `experiments/bas_sample.yaml` and nothing in the codebase hard-codes a step. When the real text arrives,
> editing that one file is the entire migration. Resolve via the SIH portal clarification channel, the
> post-registration student dashboard, or the ISRO SPOC.

### `bas_sample_v0` — BAS Sample Box Handling *(PROVISIONAL)*

Physical setup: one **container box**; a **red box** and a **yellow box** inside it; a **blue box** on the table
as a *distractor that is not part of the procedure*; two taped marker zones labelled RED and YELLOW. Fixed
webcam on a tripod, top-down-ish, ~60 cm above the table.

> The blue distractor is a deliberate design choice: it makes `WRONG_OBJECT` unambiguous (an action on an
> object that appears nowhere in the procedure) instead of aliasing with skip-ahead, and it gives the T2 colour
> detector a third, well-separated hue.

| # | Step id | Verb | Object | Completion condition | Voice on entry |
|---|---|---|---|---|---|
| 1 | `open_container` | `OPEN` | `CONTAINER` | lid open, both inner boxes visible | "Step one. Open the container." |
| 2 | `pick_red` | `PICK` | `RED_BOX` | red box leaves the container | "Step two. Pick up the red box." |
| 3 | `place_red` | `PLACE` | `RED_BOX` | red box at rest inside RED zone | "Step three. Place the red box on the red marker." |
| 4 | `pick_yellow` | `PICK` | `YELLOW_BOX` | yellow box leaves the container | "Step four. Pick up the yellow box." |
| 5 | `place_yellow` | `PLACE` | `YELLOW_BOX` | yellow box at rest inside YELLOW zone | "Step five. Place the yellow box on the yellow marker." |
| 6 | `close_container` | `CLOSE` | `CONTAINER` | lid closed | "Final step. Close the container." |

Event vocabulary: verbs `OPEN CLOSE PICK PLACE`; objects `CONTAINER RED_BOX YELLOW_BOX BLUE_BOX`.
Canonical event name = `VERB_OBJECT`, e.g. `PICK_RED_BOX`.

### Condition definitions

| Condition | Definition (engine-level) | Example against the sequence above |
|---|---|---|
| **Correct** | event verb+object == expected step | at step 3, `PLACE_RED_BOX` |
| **Skipped step** | event exactly matches step *N+k*, k≥1 → steps *N..N+k−1* marked `SKIPPED` | at step 4, `PLACE_YELLOW_BOX` → step 4 skipped |
| **Wrong object** | verb matches expected, object differs, and the event is not a future step | at step 2, `PICK_BLUE_BOX` |
| **Wrong action** | object matches expected, verb differs | at step 3, `PICK_RED_BOX` (re-picking what should be placed) |
| **Out-of-sequence repeat** | event matches an already-`DONE` step | at step 4, `OPEN_CONTAINER` |
| **Unexpected** | verb+object combination in no step at all | `PLACE_BLUE_BOX` |
| **Low confidence** | `confidence < 0.55` → held, logged, **not acted on** | any |
| **Stalled** | no accepted event for 15 s while `AWAITING` | re-prompt |
| **Paused** | operator pressed Pause, or 45 s of stall | clock frozen, perception ignored |
| **Aborted** | operator pressed Abort, or 120 s paused | log finalised as `INCOMPLETE` |
| **Complete** | last step reaches `DONE` | log finalised as `COMPLETE` |

**Recovery behaviour — the engine never auto-advances past an error.** On any error the engine enters
`ERROR_PENDING`, keeps `expected_step` unchanged, and emits a *corrective instruction* built from what actually
happened. `ERROR_PENDING` clears when either the correct event arrives, or the undo of the erroneous action
arrives (e.g. `PLACE_BLUE_BOX` after `PICK_BLUE_BOX`), or the operator clicks "Acknowledge". Skipped steps are
recorded as `SKIPPED` permanently — the engine does not pretend they happened, and the final log says so. If
the operator then performs a skipped step out of order, it is accepted as `RECOVERED_LATE` and the step flips
`SKIPPED → DONE_LATE`. That last rule is what makes the demo's recovery beat land.

### Voice guidance per state

| State / decision | Utterance |
|---|---|
| `RUNNING` entry | "Experiment started. Step one. Open the container." |
| `CORRECT` | "Correct. Next: place the red box on the red marker." |
| `WRONG_OBJECT` | "Wrong object. That is the blue box. Step two needs the red box." |
| `WRONG_ACTION` | "That step is already picked up. Place the red box on the red marker." |
| `SKIP_AHEAD` | "Step four was skipped. Return the yellow box, then pick up the yellow box after step three." |
| `OUT_OF_SEQUENCE_REPEAT` | "That step is already complete. Continue with step four." |
| `UNEXPECTED` | "Unrecognised action. Waiting for step three." |
| `LOW_CONFIDENCE` | *silent* — logged and shown greyed only |
| `STALLED` (15 s) | "Waiting. Step three: place the red box on the red marker." |
| `PAUSED` | "Experiment paused." |
| `RESUMED` | "Resuming. Step three: place the red box on the red marker." |
| `ABORTED` | "Experiment aborted at step three. Log saved." |
| `COMPLETE` | "Experiment complete. Six steps, one error recovered. Log saved." |

---

## 5. Architecture

```
┌──── PERCEPTION (swappable, may be simulated) ───────────────┐
│  Camera ─► FrameBus ─┬─► ColorBlobPerception (T2, real CV)  │
│                      │   ScriptedPerception (T0)            │
│                      │   ManualPerception  (T1)             │
└──────────────────────┼──────────────────────────────────────┘
                       │  ActionEvent {action, confidence, timestamp}
                       ▼
┌──── DETERMINISTIC REASONING (always real, pure, tested) ────┐
│  EventGate (confidence + debounce)                          │
│         ▼                                                   │
│  ProcedureEngine   pure: (State, Event|Tick) -> (State,     │
│                                            [Decision])      │
└──────────────────────┬──────────────────────────────────────┘
                       │  Decision
        ┌──────────────┼──────────────┬───────────────┐
        ▼              ▼              ▼               ▼
   GuidanceGen     LogWriter     RunRecorder    StateBroadcaster
   (text+speech)  (.txt/.jsonl)  (mp4 + UDP)      (WebSocket)
        └──────────────┴──────────────┴───────────────┘
                       ▼
┌──── UI (dumb renderer) ─────────────────────────────────────┐
│  Dashboard: WS state snapshot ─► DOM;  <img> ◄─ MJPEG       │
│             speak(text) ─► browser speechSynthesis          │
└─────────────────────────────────────────────────────────────┘
```

### The three separations, enforced by code shape

- **Perception never imports the engine.** It only constructs `ActionEvent` and puts it on the bus.
- **The engine imports nothing but the experiment model.** No FastAPI, no OpenCV, no asyncio, no `time.time()`
  (the clock is a parameter). It is a synchronous pure function — which is exactly why it can be exhaustively
  unit-tested in under a second and why the demo's correctness never depends on the camera.
- **The UI holds no logic.** It renders a state snapshot. Every label, colour and voice line is decided
  server-side. If the browser dies, the log is still correct.

### Replacing the mock with real ML later

The seam is one abstract base class:

```python
class PerceptionSource(Protocol):
    def start(self, bus: EventBus) -> None: ...
    def stop(self) -> None: ...
    @property
    def mode(self) -> str: ...          # "scripted" | "manual" | "colorblob" | "yolo+hands"
```

To ship real ML: implement `MLPerception(PerceptionSource)`, register it in
`perception/registry.py`, select it with `--perception ml`. Nothing else in the repo changes. The engine's
existing test suite becomes the ML pipeline's acceptance harness: replay a recorded session's frames through
`MLPerception`, feed the resulting events into the same engine, and diff against the ground-truth scenario JSON
you already wrote for the scripted tier. **The scenario files written on Day 1 become the ML labels later** —
that is the plan's best piece of leverage.

### Offline guarantee
No CDN, no font fetch, no analytics, no model download at runtime, no telemetry. `run.sh` binds `127.0.0.1`.
Verify by running the whole demo with Wi-Fi off — that is an acceptance criterion, not a hope.

---

## 6. Technology stack

| Layer | Choice | Why this, for a 3-day solo PoC on *this* machine |
|---|---|---|
| Language | **Python 3.11** (not the default 3.14) | Every CV wheel exists for 3.11; 3.14 wheels lag. |
| Env | **uv** venv | Already installed; resolves in seconds; no conda. |
| Video I/O | **opencv-python 5.0** | One dependency covers capture, HSV, contours, drawing, MJPEG encode, mp4 write. |
| Object detection | **HSV colour segmentation (OpenCV)** | Runs at 60+ fps on a 15 W CPU. The objects *are* colour-coded. A DNN detector would give ~6 fps and pull 2 GB. |
| Hand / pose | **none in MVP**; MediaPipe 0.10.21 in P2 | Verified as the last x86_64-mac wheel; CPU-viable but not needed to prove the product. |
| Action recognition | **rule-based state transitions over blob/zone occupancy** | A temporal model needs a dataset that does not exist yet. §11 is the honest path. |
| Backend | **FastAPI + uvicorn** | Async, one file for REST + WS + MJPEG + static. No alternative is smaller. |
| Realtime | **WebSocket, full state snapshot per push** | Snapshots not deltas: idempotent, reconnect-safe, ~1 KB, debuggable by eye. Removes an entire class of 2 a.m. bugs. |
| Video to browser | **MJPEG over `multipart/x-mixed-replace`** | 15 lines of server code, an `<img>` tag on the client, ~150 ms latency on localhost. *Tradeoff vs WebRTC:* more bandwidth, but zero signalling, zero STUN, zero browser-compat risk — and bandwidth is free on localhost. |
| Stream to IP | **ffmpeg 8.1.2 subprocess → `udp://<ip>:<port>` (MPEG-TS)** | Already installed. Satisfies the PS literally; demo by opening `ffplay udp://...` in a second window. |
| Local storage | **`cv2.VideoWriter`, 720p, mp4v** | 7.4 GB free — 720p keeps a 5-min run under 60 MB. |
| TTS | **browser `speechSynthesis`**, macOS `say` fallback | Offline, zero install, no audio-device fight, no `pyobjc` (which `pyttsx3` drags in). |
| Frontend | **Vanilla HTML/CSS/JS, no build** | No `npm install`, no CDN, no build failure at 2 a.m. ~12 reactive fields. *Tradeoff:* no components — there is nothing to componentise. |
| Persistence | **`experiment_log.txt` + `events.jsonl` per run**; stdlib **sqlite3** run index in P1 | The PS asks for a lightweight text file — files *are* the deliverable. Postgres would be pure ceremony. |
| Config | **YAML** for experiments + calibration; **argparse** for runtime | Human-editable is the point (§4 dependency). |
| Tests | **pytest** | The engine is pure; tests are milliseconds. |

**Rejected, with reasons:** PyTorch/ultralytics (torch 2.2.2 ceiling on Intel mac, ~2 GB on a 7.4 GB disk) ·
React/Vite (build risk + node_modules for a 12-field page) · Docker (offline demo, disk) · Postgres/Redis
(nothing is concurrent or shared) · WebRTC (signalling complexity for a localhost demo) · pyttsx3 (pyobjc) ·
any LLM (the procedure is deterministic — see §8).

---

## 7. Mock perception design

### The contract — the only thing perception may emit

```python
@dataclass(frozen=True)
class ActionEvent:
    action: str          # "PICK_RED_BOX" — VERB_OBJECT, from the experiment vocabulary
    confidence: float    # 0.0–1.0
    timestamp: float     # seconds since run start (monotonic), NOT wall clock
    source: str          # "scripted" | "manual" | "colorblob" | ...
    evidence: dict = {}  # free-form: bbox, zone, track_id, frame_no — logged, never used for logic
```

`evidence` is the forward-compatibility valve: real ML will want to attach boxes and keypoints, and it can,
without ever changing the engine's input type.

### `ScriptedPerception` (T0)

Reads `scenarios/<name>.json` and emits events on an asyncio timeline against the run clock.

```json
{
  "name": "wrong_object_then_recover",
  "description": "Operator grabs the blue distractor at step 2, is corrected, recovers.",
  "events": [
    {"t": 2.0,  "action": "OPEN_CONTAINER",   "confidence": 0.96},
    {"t": 6.5,  "action": "PICK_BLUE_BOX",    "confidence": 0.91},
    {"t": 11.0, "action": "PLACE_BLUE_BOX",   "confidence": 0.88},
    {"t": 15.0, "action": "PICK_RED_BOX",     "confidence": 0.94},
    {"t": 19.5, "action": "PLACE_RED_BOX",    "confidence": 0.93}
  ]
}
```

Two knobs that matter for realism: `--jitter 0.4` perturbs each `t` by ±0.4 s so timings are never suspiciously
round, and confidences are authored in a plausible band (0.85–0.97 for clean actions, 0.6–0.8 for fumbled ones)
rather than all 0.99. **Scripted-mode confidences are authored, not measured, and the UI says so.**

### `ManualPerception` (T1)

A hidden operator panel (toggle with `~`) plus number-key hotkeys, each firing one `ActionEvent` with a
randomised confidence in a configured band. Purpose: when a judge says *"what if I do X?"*, you do X.

### Required scenario library (all seven, authored Day 2 morning)

| File | Demonstrates |
|---|---|
| `perfect_run.json` | Steps 1–6 clean → `COMPLETE` |
| `wrong_object.json` | `PICK_BLUE_BOX` at step 2 → `WRONG_OBJECT` → recovery |
| `wrong_action.json` | `PICK_RED_BOX` at step 3 → `WRONG_ACTION` → recovery |
| `skipped_step.json` | `PLACE_YELLOW_BOX` at step 4 → step 4 `SKIPPED` → `DONE_LATE` recovery |
| `stall_and_resume.json` | 20 s gap → `STALLED` re-prompt → operator continues |
| `abandoned.json` | operator stops at step 3 → `PAUSED` → `ABORTED` → incomplete log |
| `demo_master.json` | **the scripted spine of §10**, ~2:20, exercises all of the above |

### `ColorBlobPerception` (T2, real CV — P1)

Per frame at 15 fps on a 640×360 downscale:
1. BGR→HSV, threshold per calibrated colour range, morphological open/close, largest contour per colour → blob
   centroid + area. `calibration.yaml` holds the ranges (produced by `tools/calibrate.py`).
2. Zone occupancy: point-in-polygon of each blob centroid against `CONTAINER`, `RED_ZONE`, `YELLOW_ZONE`,
   `TABLE`, defined once in the same YAML.
3. Skin-tone/motion mask gives a crude hand region; "hand overlaps blob" is the interaction cue.
4. Transitions, each requiring **N=5 consecutive frames** of stability to fire:
   - blob leaves `CONTAINER` while hand overlaps → `PICK_<COLOR>`
   - blob enters `<COLOR>_ZONE` and hand withdraws → `PLACE_<COLOR>`
   - `CONTAINER` interior area visible crosses a threshold → `OPEN_/CLOSE_CONTAINER`
5. Confidence = a real number: `f(blob area stability, frames of agreement, zone-margin distance)` — clamped
   to 0.5–0.95. It is genuinely measured, unlike the scripted tier, and the badge tells you which you're seeing.

The **N-frame stability requirement plus the engine's 1.5 s per-action refractory window** is what stops a
flickering blob from machine-gunning events. Both are needed; neither alone is sufficient.

---

## 8. Procedure engine

### States

`IDLE → RUNNING → AWAITING_STEP ⇄ ERROR_PENDING ⇄ PAUSED → COMPLETE | ABORTED`

| State | Meaning | Accepts events? |
|---|---|---|
| `IDLE` | loaded, not started | no |
| `RUNNING` | transient — entered on Start, immediately announces step 1 | — |
| `AWAITING_STEP` | normal operating state, waiting for `expected_step` | yes |
| `ERROR_PENDING` | an error is open; `expected_step` is frozen | yes (to recover) |
| `PAUSED` | operator paused, or 45 s stalled; clock frozen | no (buffered + discarded) |
| `COMPLETE` | final step `DONE` | no |
| `ABORTED` | operator aborted, or 120 s paused | no |

Per-step status: `PENDING → DONE`, or `PENDING → SKIPPED → DONE_LATE`.

### Classification ladder — evaluated strictly in this order

The order is the design. Two rules can both match one event; the earlier rule wins because it produces the more
actionable instruction.

```
0. confidence < 0.55                        -> LOW_CONFIDENCE   (log only, no state change, no voice)
1. event == expected step                   -> CORRECT
2. event == some step N+k, k>=1 (PENDING)   -> SKIP_AHEAD       (mark N..N+k-1 SKIPPED)
3. event == some SKIPPED step               -> RECOVERED_LATE   (that step -> DONE_LATE)
4. event == some DONE step                  -> OUT_OF_SEQUENCE_REPEAT
5. verb == expected.verb, object differs    -> WRONG_OBJECT
6. object == expected.object, verb differs  -> WRONG_ACTION
7. otherwise                                -> UNEXPECTED_ACTION
```

Worked example: at step 3 (`PLACE_RED_BOX`), the operator does `PLACE_YELLOW_BOX`. Rule 2 fires before rule 5,
so this is reported as *"steps 3 and 4 were skipped"* rather than *"wrong object"* — but the guidance string
carries both facts: *"You placed the yellow box. The red box should go first — step three was skipped."*
Precedence chooses the headline; the message keeps the detail.

### Signature

```python
def step(state: RunState, input: ActionEvent | Tick) -> tuple[RunState, list[Decision]]
```

Pure. Immutable `RunState`. No `time.time()` — `Tick(now: float)` is delivered by the caller at 2 Hz and is what
drives stall/pause/abort timeouts. Consequences: the entire behaviour of the system is reproducible from a list
of inputs; the test suite runs in milliseconds; and a scenario file *is* a test case.

### Gate in front of the engine (not part of it)

`EventGate` drops any event whose `(verb, object)` repeats within 1.5 s. This belongs outside the engine so the
engine stays a pure function of the *accepted* event sequence, and so the debounce window is tunable per
perception tier (T2 needs it; T0 does not).

### Why not an LLM

Sequence validation here is exact string comparison against an ordered list of six items with a deterministic
precedence ladder. An LLM would be non-deterministic, slower, unexplainable, requires the network or gigabytes
of local weights (against 7.4 GB free), and cannot be unit-tested. There is no requirement in the PS it would
satisfy. The right answer to *"where's the AI?"* is: the AI is in perception; validation is a state machine, and
that is a feature — mission-critical procedure checking should be provably correct, not probabilistic.

---

## 9. UI design

Single page, dark mission-control aesthetic. One accent per semantic: green `#3ddc84` correct, amber `#ffb020`
warning, red `#ff5c5c` error, cyan `#4dd0e1` info. Monospace for telemetry, sans for prose.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ORBIT-ASSIST    BAS Sample Box Handling      ● PERCEPTION: LIVE-CV       │
│                                              RUN 2026-08-31T14:02  02:14 │
├─────────────────────────────────────┬────────────────────────────────────┤
│                                     │  STATUS      ▸ AWAITING STEP 3     │
│                                     ├────────────────────────────────────┤
│         LIVE VIDEO (MJPEG)          │  CURRENT STEP                      │
│         with CV overlays in T2      │  3 · Place the red box on the      │
│                                     │      red marker                    │
│                                     │  NEXT ▸ 4 · Pick up the yellow box │
│                                     ├────────────────────────────────────┤
│                                     │  DETECTED   PLACE_RED_BOX          │
│                                     │  CONFIDENCE ████████░░  0.93       │
├─────────────────────────────────────┴────────────────────────────────────┤
│ ⚠  WRONG OBJECT — that is the blue box. Step 2 needs the red box.        │
├──────────────────────────────────────────────────────────────────────────┤
│ ①─────②─────③─────④─────⑤─────⑥        ✓ done  ▸ active  ⚠ error  ○ next │
├──────────────────────────────────────────────────────────────────────────┤
│ EVENT LOG                                                                │
│ 00:19.5  ✓ PLACE_RED_BOX      0.93   step 3 complete                     │
│ 00:15.0  ✓ PICK_RED_BOX       0.94   step 2 complete                     │
│ 00:11.0  ↩ PLACE_BLUE_BOX     0.88   error resolved                      │
│ 00:06.5  ⚠ PICK_BLUE_BOX      0.91   WRONG OBJECT                        │
├──────────────────────────────────────────────────────────────────────────┤
│  [ ▶ START ]  [ ⏸ PAUSE ]  [ ⏹ ABORT ]      🔊 voice ✓   ⬇ download log  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Visual hierarchy, in the order the eye should land:** (1) the alert banner — it is the only thing that changes
colour and it is dead centre; (2) CURRENT STEP, largest type on the page; (3) the video; (4) the timeline strip,
which is the whole run legible in one glance; (5) the event log, which scrolls and proves nothing was faked.

**Interaction flow:** page load → `IDLE`, Start enabled, everything else greyed. Start → **this click is also
the user gesture that unlocks `speechSynthesis` in Chrome** (fire a silent priming utterance on it; without
this the first alert is silent and it will look broken). During a run only Pause/Abort are live. On completion
the alert band turns green with the summary and the download-log link activates.

**Motion budget:** one 150 ms fade on step change, one 400 ms pulse on error. Nothing else animates. Animation
on a live-video dashboard reads as noise, and every minute spent on it is a minute off §12 Day 3.

---

## 10. Demo script — 2 min 30 s

Run the master scenario. Backup: a screen recording of a clean run, plus OBS Virtual Camera loaded with a
recorded session, plus T0 scripted mode bound to a hotkey.

| t | Beat | On screen / audio | The point being made |
|---|---|---|---|
| 0:00 | **Framing** | dashboard idle, one sentence: *"Comms delay makes ground support impossible. This is the on-board procedure assistant."* | problem, in 10 s |
| 0:15 | **Start** | click Start → 🔊 *"Experiment started. Step one. Open the container."* | it suggests the next step (PS req.) |
| 0:25 | **Correct steps** | open container, pick red → 🔊 *"Correct. Next: place the red box on the red marker."* timeline ①② go green | live recognition + guidance |
| 0:50 | **Wrong object** | reach for the **blue** box → banner red, 🔊 *"Wrong object. That is the blue box. Step two needs the red box."* | wrong-object detection + **voice alert** (PS req.) |
| 1:05 | **Recovery** | put blue back, pick red → banner clears, 🔊 *"Correct."* | it guides, it doesn't just complain |
| 1:20 | **Skipped step** | jump straight to placing the **yellow** box → 🔊 *"Step four was skipped."* timeline ④ turns amber | skip detection (PS req.) |
| 1:35 | **Recovery from skip** | go back and pick the yellow box → ④ flips amber→green `DONE_LATE` | it tracks *repair*, not just failure |
| 1:45 | **Pause** | click Pause → 🔊 *"Experiment paused."* clock freezes, perception ignored | operator stops midway |
| 1:55 | **Resume** | 🔊 *"Resuming. Step five: place the yellow box on the yellow marker."* | it re-orients you on return |
| 2:05 | **Complete** | close container → banner green, 🔊 *"Experiment complete. Six steps, one error recovered, one step completed late."* | full closure |
| 2:15 | **The log + the stream** | open `experiment_log.txt` on screen; flick to the `ffplay udp://…` window showing the same feed; point at `recordings/` | text log, IP stream, local storage — 3 PS reqs in 15 s |
| 2:25 | **The honest close** | *"Perception is a swappable module — this ran on classical colour CV; the ML tier plugs into the same interface. The sequence validator is a deterministic state machine with a full test suite, because procedure checking should be provable, not probabilistic."* | converts the PoC's limits into architecture |

The intelligence is obvious without a trained model because **the visible reasoning is the state machine**:
knowing that step 4 was skipped, and then that it was later repaired, is something no naive classifier does, and
it reads instantly on the timeline strip.

---

## 11. Future ML / dataset roadmap *(post-PoC, for the SIH stage)*

**Record:** fixed camera, same framing as deployment. **30–40 sessions** minimum for a first usable model:
20 nominal runs, 12 error runs (3 per error class), 6 adversarial (occluded hands, fumbles, two-handed, box
dropped). **4–6 actors** with different hand sizes, skin tones, sleeve colours and handedness. **Variation to
capture:** three lighting conditions (bright/dim/side-lit), two camera heights, two table surfaces, and — the
one that actually matters for BAS — **camera roll of 0°/90°/180°**, since there is no fixed "up" in orbit.
Reserve ~15 GB (this machine has 7.4 GB free — record to external storage).

**Annotation format:** per-session JSON, temporal segments —
`{"session_id", "actor", "condition", "segments":[{"start_s","end_s","verb","object","label","notes"}]}` —
which is the same shape as the PoC's scenario files, so **Day 1's scenario JSON is the annotation schema**.
Object boxes only for the frames used to fine-tune a detector; use CVAT or Label Studio, ~2 min per minute of
video. **Split by session and actor, never by frame:** train 60% / val 20% / test 20%, with at least one actor
and one lighting condition held out entirely — frame-level splits leak and will produce a fake 99%.

**Model order — each stage only if the previous one is measurably insufficient:**
1. **Baseline (already have):** colour + zone rules. Measure it. Report per-action precision/recall and
   end-to-end sequence accuracy. A measured 78% baseline beats an unmeasured "deep learning solution."
2. **Object detection:** fine-tune YOLOv8n on ~800 annotated frames, export to ONNX, run under onnxruntime.
   Replaces colour thresholds; removes the lighting fragility. *Do this first* — it is the highest ratio of
   robustness gained to effort spent.
3. **Hand tracking (MediaPipe Hands):** introduce when the detector is solid but PICK/PLACE timing is noisy.
   Gives real hand-object interaction: contact = min distance(fingertips, box) < τ over k frames. This is the
   PS's "hand-object interaction" requirement, met properly.
4. **Pose (MediaPipe Pose):** only when body context starts to matter — reaching toward the wrong rack, leaving
   frame. Low priority for a tabletop procedure.
5. **Temporal action model:** worthwhile once you have ≥30 sessions *and* the rule layer demonstrably fails on
   ambiguous motion. Start with a small TCN or GRU over a per-frame feature vector (object boxes + 21 hand
   keypoints + zone occupancy), ~50 k params, CPU-real-time. Do **not** start with video transformers or I3D —
   they need two orders of magnitude more data than you will have.
6. **3D HMR (the PS's optional):** last, and only as the orientation-agnostic answer. Value: pose relative to
   the payload rack rather than gravity, so recognition survives an inverted or floating operator. Approach:
   pretrained HMR backbone (e.g. a 4DHumans/HMR2-class model) → mesh in camera frame → re-express in the rack's
   coordinate frame via a known fiducial on the rack. Needs a GPU. Treat it as a demonstrated *capability
   study*, not a runtime component.

---

## 12. 3-day execution plan

Assume ~10 working hours/day. Times are elapsed-from-day-start.

### DAY 1 — foundation and vertical slice
**Objective:** an event goes in one end and comes out as correct spoken guidance, a live browser update and a log line.

| h | Task | Output |
|---|---|---|
| 0.0–0.5 | `git init`, `uv venv -p 3.11`, install 6 deps, package skeleton (§14) | repo runs, `pytest` collects |
| 0.5–1.0 | `experiments/bas_sample.yaml` + loader + `ActionEvent` + `Decision` types | `pytest tests/test_experiment_loader.py` green |
| 1.0–3.5 | **Procedure engine, TDD.** All 8 classification rules, all 7 states, step statuses | `pytest tests/test_engine.py` — ~25 tests green |
| 3.5–4.5 | `EventGate` (confidence + debounce), `Tick` handling, stall/pause/abort timers | timer tests green |
| 4.5–5.5 | `ScriptedPerception` + `perfect_run.json` + async event bus + CLI runner | `python -m orbit_assist.cli --scenario perfect_run` prints 6 correct decisions |
| 5.5–6.5 | Guidance template table; log writer → `experiment_log.txt` + `events.jsonl` | a real log file on disk |
| 6.5–8.5 | FastAPI app: `POST /run/start|pause|resume|abort`, `WS /ws` snapshots, static mount | `curl` starts a run, `wscat` shows snapshots |
| 8.5–10.0 | Ugly-but-live HTML page: status, current step, next step, event log, buttons, `speechSynthesis` | **the vertical slice** |

**Dependencies:** none external. **Stop condition:** if the engine is not green by hour 4.5, cut `RECOVERED_LATE`
and `OUT_OF_SEQUENCE_REPEAT` from P0 and proceed — they are §10 beats 7 and nothing else.
**Fallback:** if FastAPI/WS fights you past hour 8, ship the day as a rich CLI + `say` and move the web layer to
Day 2 morning. The vertical slice is the goal; the browser is one possible surface for it.

> **Do not touch the camera on Day 1.** It is the single most common way this project dies at hour 3.

### DAY 2 — system behaviour and demo intelligence
**Objective:** every demo beat works, video is real, and the T2 gamble is taken inside a fixed time-box.

| h | Task | Output |
|---|---|---|
| 0.0–1.5 | Author all 7 scenario files; add each as a pytest case asserting the exact decision sequence | 7 scenarios, 7 tests green |
| 1.5–2.5 | Recovery + skip-repair semantics verified end-to-end; guidance strings finalised | `skipped_step` demo beat lands |
| 2.5–3.5 | Voice: WS `speak` messages, browser speech queue, dedupe, **silent priming utterance on Start**, mute toggle, `say` fallback flag | audio works from a cold page load |
| 3.5–5.0 | Camera: capture thread, frame bus, MJPEG endpoint, `<img>` in page, 720p `cv2.VideoWriter` recording | live video + `recordings/<run>.mp4` |
| 5.0–5.5 | ffmpeg UDP stream to configurable IP; verify with `ffplay udp://127.0.0.1:5000` | PS streaming requirement met |
| 5.5–6.0 | `ManualPerception` (T1) hotkey panel | can trigger any event live |
| **6.0** | **HARD GATE** — all P0 features exist. If not, cancel T2 entirely and go to Day 3. | — |
| 6.0–7.0 | `tools/calibrate.py` HSV trackbars → `calibration.yaml`, under demo lighting | calibrated ranges |
| 7.0–10.0 | **`ColorBlobPerception` (T2)**: blobs, zones, hand cue, N-frame stability, real confidence | live CV firing correct events |
| **10.0** | **HARD ABANDON** — if T2 is not reliably producing correct events, commit to T0+T1, delete nothing, move on. | — |

**Dependencies:** Day 1 slice; macOS camera permission granted to the terminal **before** hour 3.5 (grant it on
Day 1 evening with a 3-line OpenCV script — the permission dialog on first `VideoCapture` is a classic 20-minute
surprise). **Stop condition:** the two hard gates above, obeyed literally.
**Fallback:** T0 scripted mode is the demo path. It was always the demo path; T2 is the upgrade.

### DAY 3 — UI, integration, polish, presentation
**Objective:** it looks like a product, it survives three consecutive rehearsals, and there is a backup for every failure.

| h | Task | Output |
|---|---|---|
| 0.0–3.0 | Dashboard layout + styling per §9: grid, panels, typography, colour semantics | it stops looking like a debug page |
| 3.0–4.0 | Timeline strip with step chips; confidence bar; alert banner states | the run is legible at a glance |
| 4.0–4.5 | Post-run summary card; download-log link | closing beat |
| 4.5–5.0 | `run.sh`, README with a 5-line quickstart, `--perception` flag documented | anyone can start it |
| 5.0–6.0 | **Full offline test: Wi-Fi off, fresh terminal, `./run.sh`, complete run** | offline acceptance criterion |
| 6.0–7.0 | **Rehearsal 1** — full §10 script, timed, note every stumble | list of defects |
| 7.0–7.5 | Fix only demo-blocking defects. **Feature freeze at 7.5.** | — |
| 7.5–8.0 | **Record a backup screen capture of a perfect run**; load a recorded session into OBS Virtual Camera | two independent fallbacks |
| 8.0–9.0 | Architecture diagram + 5 slides (problem, architecture, error taxonomy, what's real vs simulated, roadmap) | presentable |
| 9.0–10.0 | **Rehearsals 2 and 3.** No code changes. | ≤2:45 consistently |

**Stop condition:** feature freeze at hour 7.5 is absolute. **Fallback:** if anything breaks after freeze, play
the screen recording and narrate it — and say that you are doing so.

### Absolute minimum path to a working demo
If everything goes wrong, these seven items still make a credible showing:
`experiment YAML → procedure engine → scripted perception → guidance text → browser voice → minimal HTML with
current/next step + event log → experiment_log.txt`. That is **Day 1 plus the scenarios from Day 2 morning** —
roughly 12 hours. Video, streaming, the timeline strip and T2 are all additive.

---

## 13. Risk register

| # | Risk | Sev | Lik | Mitigation | Fallback |
|---|---|---|---|---|---|
| R1 | **Simulated perception is obvious / feels dishonest** | High | High | Label the tier in the UI; jitter timings; plausible confidence bands; ship T2 so at least one tier is genuinely real; lead the close with the swappable-interface argument | If T2 fails, say plainly: "perception is scripted for this PoC; here is the interface the ML plugs into" — a labelled mock is respected, a caught one is not |
| R2 | **Conflating recognition with sequence validation** in the pitch | High | Med | Two named modules, two slides, one sentence each; never say "the AI decided the step was wrong" | — |
| R3 | **T2 colour CV eats Day 2** | High | High | Two hard gates (h6 start, h10 abandon); T2 is P1 and never blocks a P0 | T0 + T1 |
| R4 | **Lighting changes between calibration and demo** | High | Med | Calibrate *in the demo room*; keep `tools/calibrate.py` on a hotkey for a 60 s re-calibration; blue distractor is far from red/yellow in hue | Switch to T0 mid-demo with one hotkey |
| R5 | **Overengineering / scope creep** | High | High | Every feature is in a P0/P1/P2 table; anything not in P0 is refused until all P0 is green; feature freeze Day 3 h7.5 | — |
| R6 | Disk exhaustion (**7.4 GB free**) | Med | Med | No torch, no node_modules; 720p recording; prune `runs/` between rehearsals; `df -h` before the demo | Delete old recordings; record at 480p |
| R7 | **Chrome blocks `speechSynthesis` before a user gesture** — first alert is silently missing | Med | **High** | Fire a silent priming utterance inside the Start click handler; test from a cold page load | macOS `say` subprocess on the backend (`--tts say`) |
| R8 | macOS denies camera access to the terminal | High | Med | Grant on **Day 1 evening** with a 3-line test script, not on Day 2 under pressure | OBS Virtual Camera with a recorded file |
| R9 | Video latency / MJPEG stalls the event loop | Med | Med | Capture in its own thread; MJPEG generator yields the *latest* frame and never queues; cap 15 fps, 640×360 for the browser | Drop the live feed to a static frame; the log and timeline carry the demo |
| R10 | WebSocket reconnect/state-desync bugs | Med | Med | Push **full snapshots**, not deltas; client re-renders idempotently; auto-reconnect with a 1 s retry | Page reload restores full state, because state lives on the server |
| R11 | Excessive frontend time | Med | High | Vanilla, no build; UI is Day 3 only; §9 wireframe is the spec and is not renegotiated | Ship the Day 1 page with better CSS |
| R12 | Accidental cloud dependency (a font, a CDN, an icon set) | High | Med | No external URLs anywhere in `web/`; grep for `http` before the freeze | — |
| R13 | **Claiming unmeasured ML accuracy** | **Critical** | Med | Never state an accuracy number that was not measured. If asked: "the classical tier is not yet benchmarked; §11 is how we would measure it." | — |
| R14 | Perception event storms (flicker) | Med | Med | N-frame stability in T2 **and** 1.5 s refractory in `EventGate` | Raise both thresholds |
| R15 | The real ISRO sequence arrives and differs | Low | Med | The sequence is one YAML file; nothing hard-codes a step | Edit YAML, re-author scenarios (~1 h) |
| R16 | Solo-developer illness / lost day | High | Low | Day 1's vertical slice is independently demoable | Present the minimum path (§12) |

---

## 14. Acceptance criteria

**Ship gate — every box must be observably true, checked with the app running.**

*Core loop*
- [ ] `./run.sh` starts the whole system with one command on a fresh terminal
- [ ] The entire demo completes with **Wi-Fi disabled**
- [ ] Clicking Start announces step 1 by voice within 2 s
- [ ] After each correct step, the system speaks a confirmation **and** names the next step
- [ ] A wrong-object action produces a red banner + a specific spoken correction naming both the wrong and the right object
- [ ] A wrong-action produces a distinct message from wrong-object
- [ ] Skipping a step is announced as a skip, names the skipped step number, and marks it amber on the timeline
- [ ] Performing a skipped step later flips it amber→green and is spoken as recovered
- [ ] 15 s of inactivity triggers a spoken re-prompt
- [ ] Pause freezes the elapsed clock and ignores perception; Resume re-announces the current step
- [ ] Abort finalises the log as `INCOMPLETE` with the reached step

*Artifacts*
- [ ] `runs/<id>/experiment_log.txt` exists, is human-readable, and every line carries a timestamp, step, action, and outcome
- [ ] `runs/<id>/events.jsonl` parses as JSON lines
- [ ] The log distinguishes `DONE`, `SKIPPED`, `DONE_LATE`, and error events
- [ ] `runs/<id>/video.mp4` plays and covers the whole run
- [ ] `ffplay udp://<configured-ip>:<port>` shows the live feed during a run

*Engineering*
- [ ] `pytest` passes with ≥25 engine tests, including one per scenario file
- [ ] The engine module imports no FastAPI, no OpenCV, no asyncio, and calls no wall clock
- [ ] Switching `--perception scripted|manual|colorblob` changes nothing outside `perception/`
- [ ] `grep -rn "http://\|https://" web/` returns nothing
- [ ] `git log` shows work committed at least at each day boundary

*Demo readiness*
- [ ] Three consecutive full rehearsals completed with no crash and no restart
- [ ] Total runtime ≤ 2:45
- [ ] A backup screen recording of a perfect run exists and plays
- [ ] A one-sentence honest answer is prepared for: "how much of this AI is real?"

**"Can I show this to the panel?" — yes when every box above is ticked and the last one is answered without hesitating.**

---

## 15. Repository structure

```
SIH 2026/
├── run.sh                          # one command, offline
├── pyproject.toml                  # uv/pytest config, py3.11
├── README.md
├── docs/
│   ├── SIH26174-problem-statement.md   # verbatim official PS
│   ├── ENVIRONMENT.md                  # verified machine + dependency facts
│   ├── PLAN.md                         # this file
│   └── architecture.png                # Day 3
├── experiments/
│   └── bas_sample.yaml             # THE sequence — swap when ISRO's text arrives
├── scenarios/                      # scripted perception + engine test fixtures + future ML labels
│   ├── perfect_run.json  wrong_object.json  wrong_action.json
│   ├── skipped_step.json stall_and_resume.json abandoned.json
│   └── demo_master.json
├── config/
│   ├── calibration.yaml            # HSV ranges + zone polygons (T2)
│   └── runtime.yaml                # camera index, stream IP/port, thresholds
├── orbit_assist/
│   ├── models.py                   # ActionEvent, Decision, RunState, StepStatus
│   ├── experiment.py               # YAML loader + validation
│   ├── procedure/
│   │   ├── engine.py               # PURE. no I/O, no clock, no framework.
│   │   └── classify.py             # the precedence ladder
│   ├── perception/
│   │   ├── base.py                 # PerceptionSource protocol  <-- THE SEAM
│   │   ├── registry.py             # name -> class
│   │   ├── scripted.py  manual.py  # T0, T1
│   │   ├── colorblob.py            # T2 (P1)
│   │   └── ml.py                   # T3 stub with a docstring contract
│   ├── gate.py                     # confidence + debounce
│   ├── guidance.py                 # decision -> (screen text, speech text)
│   ├── logging_/
│   │   ├── text_log.py  jsonl_log.py
│   ├── video/
│   │   ├── capture.py              # thread + frame bus
│   │   ├── recorder.py             # cv2.VideoWriter
│   │   ├── mjpeg.py                # browser feed
│   │   └── streamer.py             # ffmpeg -> udp://IP:PORT
│   ├── api/
│   │   ├── app.py  routes.py  ws.py
│   ├── session.py                  # orchestrator: wires bus -> gate -> engine -> sinks
│   └── cli.py                      # headless runner (no browser needed)
├── web/
│   ├── index.html  app.js  styles.css   # no build, no CDN
├── tools/
│   ├── calibrate.py                # HSV trackbars
│   └── camera_check.py             # 3-line permission smoke test — run Day 1 evening
├── tests/
│   ├── test_engine.py  test_classify.py  test_gate.py
│   ├── test_scenarios.py           # every scenario -> expected decision sequence
│   └── test_experiment_loader.py
└── runs/                           # gitignored: <run_id>/{experiment_log.txt,events.jsonl,video.mp4}
```

Rules: `procedure/` may import `models.py` and nothing else. `perception/` may import `models.py` and nothing
else. Only `session.py` and `api/` know about both. Enforced by one import-lint test if it is ever in doubt.

---

## 16. Exact implementation order

Ask Claude Code for these in order. Each is independently verifiable; do not start one before the previous is green.

```
 1. Repo skeleton + uv venv (py3.11) + pyproject + pytest wiring + .gitignore + git init
 2. models.py — ActionEvent, Decision, StepStatus, RunState  (frozen dataclasses)
 3. experiments/bas_sample.yaml + loader + validation + tests
 4. procedure/classify.py — the 8-rule precedence ladder + exhaustive unit tests
 5. procedure/engine.py — pure step(), all 7 states, TDD    <-- the heart of the product
 6. gate.py — confidence threshold + 1.5s debounce + tests
 7. Tick handling: stall (15s), auto-pause (45s), auto-abort (120s) + tests
 8. perception/base.py + registry.py  (THE SEAM — write this before any implementation)
 9. perception/scripted.py + scenarios/perfect_run.json + async event bus
10. session.py orchestrator + cli.py            <-- FIRST END-TO-END: headless, no web, no camera
11. guidance.py — decision -> screen text + speech text (table-driven)
12. logging_/ — experiment_log.txt + events.jsonl, written incrementally
13. api/app.py — FastAPI, REST controls, WS full-snapshot broadcast, static mount
14. web/ v0 — plain HTML, state rendering, buttons, speechSynthesis + priming on Start
        ===== END OF DAY 1: vertical slice complete =====
15. Remaining 6 scenario files + tests/test_scenarios.py asserting exact decision sequences
16. Recovery semantics: SKIPPED -> DONE_LATE, ERROR_PENDING clearing, acknowledge action
17. Voice polish: speech queue, dedupe, mute toggle, `say` backend fallback
18. video/capture.py frame bus + tools/camera_check.py
19. video/mjpeg.py + <img> in the page
20. video/recorder.py — 720p mp4 per run
21. video/streamer.py — ffmpeg to udp://IP:PORT, verified with ffplay
22. perception/manual.py — hotkey panel (T1)
        ===== HARD GATE: all P0 done? if not, skip 23-24 =====
23. tools/calibrate.py — HSV trackbars -> config/calibration.yaml
24. perception/colorblob.py — T2 real CV  (HARD ABANDON at Day 2 h10)
        ===== END OF DAY 2 =====
25. web/ v1 — full §9 layout, styling, colour semantics, typography
26. Timeline strip + confidence bar + alert banner states
27. Post-run summary card + download-log link
28. run.sh + README + offline verification (Wi-Fi off)
29. Rehearse; fix only demo-blocking defects; FEATURE FREEZE
30. Backup screen recording + OBS Virtual Camera fallback + slides + rehearse ×2
```

---

## 17. What NOT to build

- **Any LLM anywhere.** §8 explains why. If a judge asks, the answer is a design argument, not an omission.
- **3D HMR / pose estimation / any trained model.** Optional in the PS, impossible in 3 days, and unnecessary
  to prove the product.
- **PyTorch, ultralytics, YOLO.** torch caps at 2.2.2 on this Intel Mac and costs ~2 GB of 7.4 GB free.
- **React, Vite, Tailwind, npm, any build step.** 12 reactive fields.
- **Docker, Postgres, Redis, Celery, nginx.** Nothing is concurrent, shared, queued or proxied.
- **WebRTC / RTSP / HLS.** MJPEG plus an ffmpeg UDP stream satisfies the PS on localhost.
- **A second experiment, or an experiment-authoring UI.** One experiment, done excellently (decision rule 2).
- **Auth, users, roles, multi-tenancy, settings pages.**
- **Dataset collection during the 3 days.** It buys nothing for this demo; §11 is where it belongs.
- **Recording your own training video "just in case".** It will eat Day 2.
- **Charts, dashboards-of-dashboards, dark/light theming, icon libraries, animation frameworks.**
- **Refactoring the engine after Day 2.** It is pure and tested; leave it alone.
- **Any accuracy claim that has not been measured.** The single fastest way to lose a technical panel.
