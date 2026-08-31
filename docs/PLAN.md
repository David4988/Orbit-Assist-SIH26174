# ORBIT ASSIST — lean 3-day PoC plan (v2)
**SIH26174 · ISRO · internal college hackathon prototype** · revised 2026-08-31

Supersedes [`PLAN-v1-archive.md`](./PLAN-v1-archive.md) (kept for the SIH-stage ML roadmap and full risk detail).
Source of truth for the problem: [`SIH26174-problem-statement.md`](./SIH26174-problem-statement.md) ·
Machine facts: [`ENVIRONMENT.md`](./ENVIRONMENT.md)

**The shift:** v1 optimised for engine correctness. v2 optimises for a *convincing product*. The engine stays
real because it is cheap and it is the intelligence the demo shows. Everything else that was infrastructure
becomes a slide.

---

## 1. What to keep from v1

| Keep | Why |
|---|---|
| **Perception / Procedure / Assistant three-layer split** | It's the idea that makes the PoC credible. Costs nothing — it's three Python files. |
| **`ActionEvent` as the only thing perception emits** | One dataclass. It is the entire "replaceable with real ML" argument. |
| **Deterministic procedure engine** | Cheap, and it is what the demo actually shows off. Simplified from 8 rules to 6. |
| **Experiment sequence as data, not code** | Isolates the unresolved ISRO dependency (§below) to one editable file. |
| **The PS-truncation finding** | ISRO's sample sequence is cut at 500 chars on the portal. Our sequence is PROVISIONAL and labelled as such. Don't present it as ISRO's. |
| **Scenario JSON as the mock's input** | Replay + manual injection, one format. |
| **Honest "simulated perception" labelling** | Now a small mono badge in the header. A labelled mock is respected; a caught one is not. |
| **The `speechSynthesis` priming gotcha** | Chrome mutes TTS before a user gesture. Prime silently inside the Start click or the first alert is silently missing. Two lines of code, saves the demo. |
| **No torch / no ultralytics** | 6.7 GB free disk, Intel Mac caps torch at 2.2.2. Moot now anyway — no CV in scope. |
| **v1 §11 ML roadmap** | Becomes **one slide**, not a workstream. |
| **The demo beat structure** | Refined in §8. |

## 2. What to remove

**Cut outright:** ColorBlobPerception · the three-tier perception model (→ one mock + manual override) ·
MediaPipe · YOLO · PyTorch · trained models · 3D HMR · dataset collection · SQLite/Postgres/Redis · Docker ·
WebRTC/RTSP/UDP streaming · camera capture · `cv2.VideoWriter` recording · MJPEG endpoint · HSV calibration tool.

**Cut as over-engineering:** 25+ engine tests → **6** · TDD as a process · `EventGate` + debounce (scripted
events don't flicker) · the `Tick` clock architecture (→ §3, the video is the clock) · the async event bus
(→ a direct function call) · `perception/registry.py` + Protocol ceremony (→ one module with two functions) ·
`session.py` orchestrator (→ 30 lines in `main.py`) · the CLI runner (→ pytest covers it) · import-lint ·
per-day git checkpoint requirements · three-rehearsal requirement (rehearse because it's useful, not as a gate) ·
the 30-item acceptance checklist (→ **10**, §12) · `ERROR_PENDING` as a state (→ an `alert` field) ·
`OUT_OF_SEQUENCE_REPEAT` and `LOW_CONFIDENCE` gating (confidence is displayed, not acted on) ·
run index / summary persistence.

**Net effect:** v1 was ~30 modules and 30 implementation steps. v2 is **7 Python files + a React app**, 18 steps.

**One reversal, stated plainly:** v1 argued for vanilla JS and no build step. v2 uses **React + Vite + Framer
Motion**. The reason flips because the goal flipped — visual fidelity is now the primary deliverable, and the
signature interaction (§7) is a shared-layout animation between collapsing and expanding steps. Framer Motion's
`layout` / `layoutId` does that in one prop; hand-rolling it in vanilla costs more than `npm install` ever will.
Disk: `node_modules` ≈ 250 MB against 6.7 GB free — fine, but don't add a second frontend dependency casually.

---

## 3. Revised architecture

```
scenario.json ──┐
                ├─► mock perception ──► ActionEvent ──► procedure engine ──► Decision
manual trigger ─┘   (replay at time t)  {action,          (deterministic)      │
                                         confidence,                           ├─► guidance text + speech
                                         timestamp}                            ├─► log.txt / log.json
                                                                               └─► WS: full state snapshot
                                                                                        │
                                                    ┌───────────────────────────────────┘
                                                    ▼
                                     React app: procedure document, video,
                                     event log, speechSynthesis
```

Seven Python files, one React app:

```
backend/
  main.py         FastAPI: 4 REST routes + 1 WebSocket + serves the built frontend   (~120 lines)
  engine.py       the procedure engine — pure, deterministic                          (~130 lines)
  perception.py   scenario replay + manual inject → ActionEvent                       (~50 lines)
  guidance.py     Decision → {headline, detail, speech}                               (~60 lines)
  log.py          append to runs/<id>/log.txt and log.json                            (~40 lines)
  experiment.py   the step list                                                       (~30 lines)
  models.py       ActionEvent, Decision, RunState                                     (~40 lines)
frontend/         Vite + React + Framer Motion
scenarios/demo.json
assets/experiment.mp4
runs/
tests/test_engine.py    (6 tests)
```

### The one design decision that removes the most work: **the video element is the master clock**

The frontend posts `{t: video.currentTime}` over the WebSocket at 4 Hz. The backend advances the scenario and
the engine to that `t`. Consequences, all free:

- **Perfect audio/visual sync** — the event fires exactly when the hand moves on screen, always, with zero drift
  logic. This is the difference between "convincing" and "off by a second and it looks fake."
- **Pause is free.** `video.pause()` → clock stops → engine stops. No pause state to synchronise.
- **Scrubbing is free.** Useful when a judge asks to see the skip beat again.
- **The v1 `Tick` architecture disappears** — no 2 Hz timer, no stall watchdog, no clock injection.

Manual event injection still works: it's just an event delivered at whatever `t` is current.

### How this maps to the ISRO solution (the slide)

| Prototype | Real system |
|---|---|
| `perception.py` replays a scenario | CV process: detector + hand tracking + temporal model, same `ActionEvent` out |
| `assets/experiment.mp4` | fixed payload camera |
| video `currentTime` as clock | frame timestamps |
| WS to a local React app | same, plus an ffmpeg branch to `udp://<ip>` and a local `.mp4` |
| `engine.py` | **unchanged** — this is the point |

### The unresolved ISRO dependency (unchanged from v1)

The portal truncates the sample experiment at exactly 500 chars: *"...two smaller boxes of color red and
**yello**"*. Confirmed only: an outer box containing a red and a yellow box. Our 6-step sequence in
`backend/experiment.py` is **PROVISIONAL and my construction** — labelled as such in the UI's About panel and
on the slide. When the real text arrives it is a one-file edit.

`OPEN_CONTAINER → PICK_RED_BOX → PLACE_RED_BOX → PICK_YELLOW_BOX → PLACE_YELLOW_BOX → CLOSE_CONTAINER`,
plus a **blue box on the table that is not part of the procedure** — the distractor that makes WRONG_OBJECT
unambiguous and gives the demo its cleanest error beat.

### The engine, simplified

State: `status ∈ {idle, running, paused, complete}`, `current_index`, `steps[].state ∈ {pending, done,
skipped, done_late}`, `alert | None`. That's it — no ERROR_PENDING state; an error sets `alert` and leaves
`current_index` alone.

Classification, in this order (first match wins):

```
1. event == steps[current]                 -> CORRECT        step -> done, advance
2. event == steps[j], j > current, pending -> SKIPPED        steps[current..j-1] -> skipped, step j -> done, advance
3. event == steps[j] where j is skipped    -> DONE_LATE      step j -> done_late   ← the best beat in the demo
4. same verb, different object             -> WRONG_OBJECT   alert, do not advance
5. same object, different verb             -> WRONG_ACTION   alert, do not advance
6. anything else                           -> UNKNOWN        alert, do not advance
```

Rule 3 is worth its ten lines: watching an amber "skipped" step turn green when the operator goes back and does
it is the single clearest signal that something is *reasoning* rather than pattern-matching.

---

## 4. Revised P0 / P1 / P2

### P0 — the demo does not exist without these
1. Procedure engine + the 6 classification rules
2. `experiment.py` step list (+ blue distractor in the vocabulary)
3. Mock perception: scenario replay against the video clock
4. `scenarios/demo.json` — the master scenario covering all 10 required beats
5. Guidance text generator (headline + detail + speech string per decision)
6. Voice via browser `speechSynthesis`, primed on the Start click
7. Log writer → `runs/<id>/log.txt` (human) + `log.json`
8. FastAPI: `POST /start|pause|resume|reset`, `POST /event` (manual), `WS /ws`
9. React dashboard: the procedure document, current/next step, alert, event log, controls
10. **The visual design pass** — this is a P0 feature, not polish (§7)

### P1 — do these once P0 runs end to end
11. Pre-recorded `experiment.mp4` as the feed + clock sync
12. Framer Motion: step transitions, timeline progression, alert entrance, log rows, completion
13. Manual trigger panel (hidden behind `~`) for judge questions
14. Completion summary card + "Download log" link
15. Subtle `PERCEPTION · SIMULATED` badge and an About panel explaining the swap

### P2 — only if Day 3 finishes early, and never on the demo path
16. Real OpenCV colour detection as a *side* toggle
17. Live camera capture · UDP stream · local recording
18. Anything ML

**P2 must never touch a P0 file.** If it can't be added as a separate module behind a flag, it doesn't happen.

---

## 5. Revised technology stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **FastAPI + uvicorn**, one file | 4 routes + 1 WS. *Costs ~2 h vs a pure-frontend build; buys real files on disk and the credible "this is where the CV process lives" story.* Worth it. |
| Python | **3.11** via `uv venv` | Deps: `fastapi uvicorn[standard] pytest`. Nothing else. |
| Realtime | **WebSocket, full state snapshot each push** | ~1 KB. Idempotent. Reconnect = re-render. No delta bugs. |
| Frontend | **React 18 + Vite** | Fast HMR is worth real hours on a visual-heavy Day 2–3. |
| Motion | **Framer Motion** | `layout` + `layoutId` + `AnimatePresence` are exactly the three things §7 needs. |
| Styling | **Plain CSS, one `tokens.css` + per-component files** | No Tailwind, no CSS-in-JS. The design is ~15 tokens and 8 components. |
| State | **`useReducer` + one `useWebSocket` hook** | No Redux, no Zustand, no react-query. Server owns state; client renders it. |
| Fonts | **Self-hosted woff2** (§7) | Offline demo — no Google Fonts link, ever. |
| Icons | **4 hand-written inline SVGs** | No icon library. Play, pause, check, alert. |
| Video | **`<video>` + a local mp4** | Also the master clock (§3). |
| TTS | **browser `speechSynthesis`** | Offline on macOS, zero deps. |
| Storage | **two files per run** | No database. The PS asks for a lightweight text file. |
| Tests | **pytest, 6 tests, one file** | §9. |

**Not installed, not discussed again:** Tailwind · any component library · any chart library · any icon package ·
any state manager · react-router · OpenCV · torch · Docker · ffmpeg-in-the-loop.

---

## 6. Revised 3-day schedule

Roughly 9–10 h/day. Times are elapsed-from-day-start.

### DAY 1 — the whole experiment runs, logically, start to finish
*Goal: no polish, but the full scenario plays through and produces a correct log.*

| h | Task |
|---|---|
| 0.0–0.5 | `git init`, `uv venv -p 3.11`, `pip install fastapi uvicorn[standard] pytest`, folder skeleton |
| 0.5–1.0 | `models.py` + `experiment.py` (6 steps + blue distractor) |
| 1.0–3.0 | **`engine.py`** — 6 rules, 4 statuses, step states incl. `done_late` |
| 3.0–3.75 | `tests/test_engine.py` — the 6 tests (§9). Green before moving on. |
| 3.75–4.5 | `perception.py` — scenario replay keyed to `t` + manual inject |
| 4.5–5.25 | `scenarios/demo.json` — author all 10 beats with realistic timings |
| 5.25–6.0 | `guidance.py` + `log.py` — write a real `log.txt` and read it |
| 6.0–8.0 | `main.py` — REST controls, WS snapshots, the `{t}` clock ingest |
| 8.0–9.0 | Throwaway HTML page: dump the state JSON, click Start, watch it run |

**Done when:** clicking Start in a browser plays the full scenario, prints every state transition, and leaves a
correct, readable `runs/<id>/log.txt` on disk. **Fallback:** if the WS fights you past h8, verify with a pytest
that replays the scenario through the engine and asserts the final log — then wire the WS on Day 2 morning.

### DAY 2 — it becomes visually convincing and interactive
*Goal: a real product on screen, with video, voice and every error state.*

| h | Task |
|---|---|
| 0.0–0.75 | `npm create vite`, React + Framer Motion, `tokens.css`, vendored fonts, dev proxy to FastAPI |
| 0.75–1.5 | `useWebSocket` hook + reducer; render raw state to confirm the pipe |
| 1.5–4.0 | **The procedure document** (§7) — the step spine, expanded current step, collapsed completed steps, skipped steps |
| 4.0–5.0 | Video panel + `currentTime` → WS clock; Start/Pause/Resume wired to `video.play()/pause()` |
| 5.0–5.75 | Voice: speak on decision, silent priming on Start, mute toggle |
| 5.75–6.75 | Event log list + alert region + all four alert variants styled |
| 6.75–7.5 | Header, controls, `PERCEPTION · SIMULATED` badge |
| 7.5–8.5 | **Record `assets/experiment.mp4`** — one clean take of the six steps with the deliberate errors; retime `demo.json` against it |
| 8.5–10.0 | Manual trigger panel (`~`); walk the full demo once end to end |

**Done when:** you can play the demo start to finish with video, voice and every error state, and it looks like
software rather than a debug page. **Fallback:** if recording the video eats the evening, ship with a static
poster frame in the video panel — the procedure document carries the demo on its own.

### DAY 3 — it looks finished and the demo can't break
*Goal: polish, motion, choreography, and a fallback for every fragile part.*

| h | Task |
|---|---|
| 0.0–2.5 | **Typography and spacing pass.** Type scale, optical alignment, hairlines, the one shadow, tabular numerals. This is where "medium" becomes "high" polish. |
| 2.5–4.5 | **Framer Motion pass** (§7 motion table) — nothing else animates |
| 4.5–5.25 | Completion summary + download-log link |
| 5.25–6.0 | Idle/empty state — the screen before Start must look intentional, not blank |
| 6.0–6.5 | About panel: what's simulated, what's real, how ML plugs in, the PROVISIONAL-sequence note |
| 6.5–7.0 | Offline check (Wi-Fi off, `grep -rn "http" frontend/src` clean), `run.sh`, short README |
| 7.0–7.5 | Run the demo twice; fix only what breaks it. **Freeze.** |
| 7.5–8.0 | **Screen-record a perfect run** as the ultimate fallback |
| 8.0–9.0 | Slides: problem · architecture · what's real vs simulated · ML roadmap (the v1 §11 slide) |

---

## 7. UI / visual direction

### The idea

Not a dashboard. **A procedure document that writes itself.**

The vernacular of this domain is the crew checklist — the Apollo cuff checklist, the ISS Flight Data File:
numbered steps, verb-noun commands, timestamps annotated in the margin. Our event model is literally
`VERB_OBJECT`. So the interface is one living document: every step visible at once, the current one expanded,
completed ones collapsed to a single line with a timestamp stamped into the margin, skipped ones left open in
amber as unfinished business.

This is why it won't read as an AI dashboard. There is no card grid, no gauge, no chart, no sparkline.
It reads as a **printed procedure that is being filled in**.

### Signature element
The step spine. All six steps, always visible, as one continuous document with hairline rules between them.
The current step is **the only element on the page with a shadow** — elevation encodes "this is what you do
now." Completed steps collapse; the timestamp stamps into the left margin in mono. Skipped steps stay
expanded and amber until repaired, then collapse green.

This one object satisfies four requirements at once — current step, next step, timeline, and step status —
which is why it feels like a product rather than a widget board.

### Tokens

```css
--paper:  #F6F7F5;   /* off-white, faint cool grey-green. NOT cream. */
--card:   #FFFFFF;
--ink:    #16191C;   /* graphite, never pure black */
--ink-2:  #5C6469;   /* secondary */
--rule:   #E2E5E1;   /* hairlines */
--navy:   #16324F;   /* primary accent: active marker, primary button */
--go:     #1F7A4D;   /* correct */
--hold:   #B26A00;   /* skipped / warning */
--stop:   #A62B1F;   /* error */
```

The greens and reds are deliberately **printed-ink deep, not screen-bright**. That single choice is most of what
keeps this out of AI-dashboard territory. Colour appears only on state — a 2px left rule on a step, a small
label. Never a filled block, never a gradient.

### Type

- **Instrument Sans** — UI and display. Confident, slightly narrow, modern-editorial. Deliberately *not* Inter.
- **IBM Plex Mono** — action codes, timestamps, confidence. Technical without being terminal-y. `tabular-nums`.

Both self-hosted woff2 in `frontend/public/fonts` (~200 KB). **No Google Fonts link — the demo is offline.**
Weights: 400 / 500 / 600 only. Scale: 13 / 15 / 17 / 22 / 34. The current step's instruction is the only 34px
text on the page.

**Action codes are the visual motif.** `PICK_RED_BOX` set in Plex Mono, uppercase, `letter-spacing: .04em`, in
`--ink-2`. They're the domain's real vernacular and they carry information, so they get to be decorative.

### Layout (1440 × 900 target)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ORBIT ASSIST                              PERCEPTION · SIMULATED   ⓘ    │  hairline under
├───────────────────────────────────────┬──────────────────────────────────┤
│  BAS SAMPLE — BOX HANDLING            │                                  │
│  Step 3 of 6 · 00:41                  │       [ experiment video ]       │
│                                       │                                  │
│  14:02:12 ─ 1  Open the container   ✓ │  ────────────────────────────────│
│  14:02:19 ─ 2  Pick up the red box  ✓ │  OBSERVED                        │
│                                       │  PLACE_RED_BOX          0.93     │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │  ────────────────────────────────│
│  ┃ 3                               ┃  │  EVENT LOG                       │
│  ┃ Place the red box on the        ┃  │  00:41  ✓  PLACE_RED_BOX         │
│  ┃ red marker                      ┃  │  00:33  ↩  PLACE_BLUE_BOX        │
│  ┃ PLACE_RED_BOX                   ┃  │  00:28  ⚠  PICK_BLUE_BOX         │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │  00:19  ✓  PICK_RED_BOX          │
│           4  Pick up the yellow box   │  00:12  ✓  OPEN_CONTAINER        │
│           5  Place the yellow box     │                                  │
│           6  Close the container      │                                  │
├───────────────────────────────────────┴──────────────────────────────────┤
│  ▶ Start experiment      ⏸ Pause        🔊 Voice on        ⬇ Download log │
└──────────────────────────────────────────────────────────────────────────┘
```

The alert is **not** a banner. On an error, the current-step card grows a 2px `--stop` left rule and a single
line beneath the instruction: *"Wrong object — that's the blue box. Step 3 needs the red box."* Keeping the
correction inside the step card means the eye never leaves the one place it should be looking.

**Copy voice:** "Start experiment", not "Initialize". Errors state what happened and what to do, in one line,
no apology. The button that says Start produces a log line that says STARTED.

### Motion (Framer Motion) — the complete list, nothing else animates

| Moment | Treatment | ms |
|---|---|---|
| Step completes | card collapses (`layout` height+opacity), timestamp stamps into margin (y −4 → 0, fade) | 240 / 160 |
| Next step opens | expands from collapsed line, instruction fades up 6px | 280 |
| Active marker | `layoutId` on the navy marker — one element slides down the spine | 300 |
| Error appears | card shifts x 3px once, left rule draws in (`scaleX` 0→1, origin left) | 240 |
| Skip → repaired | the amber step's rule cross-fades to green, then it collapses | 320 |
| Log row | `AnimatePresence`, y 8 → 0 + fade; list reflows with `layout` | 180 |
| Start | header + spine stagger in, 40 ms apart | 400 total |
| Completion | spine collapses to a summary card, staggered | 400 |

Easing `[0.22, 1, 0.36, 1]` throughout. `prefers-reduced-motion` disables all of it. **No hover animations on
non-interactive elements, no continuous motion, no page-load shimmer.**

### Forbidden visually
Dark backgrounds · neon/glow · gradients · glassmorphism · holograms · brain/robot/circuit imagery · charts ·
gauges · progress rings · sci-fi framing · a grid of rounded cards · more than one shadow on screen ·
emoji as UI · any colour used decoratively rather than as state.

### Scope honesty on responsiveness
Design for **1280–1600 px**. Don't break below 1024. **Ignore mobile** — this is a laptop-and-projector demo and
mobile layout work is hours that buy nothing. Keyboard focus stays visible; reduced motion is respected.

---

## 8. Demo flow — 2 min 30 s

Video plays; the scenario is keyed to it; you narrate.

| t | Beat | What the screen does | Voice |
|---|---|---|---|
| 0:00 | **Idle** | Full procedure visible, all six steps quiet and pending. One line of framing: *"Comms delay makes ground support impossible. This runs entirely on board."* | — |
| 0:12 | **Start** | Header and spine stagger in; step 1 expands; video begins | *"Experiment started. Step one: open the container."* |
| 0:20 | **Step 1 correct** | Step 1 collapses, timestamp stamps into the margin, step 2 opens | *"Correct. Next: pick up the red box."* |
| 0:30 | **Step 2 correct** | Same transition — the rhythm is now established | *"Correct. Next: place the red box on the red marker."* |
| 0:42 | **Wrong object** | Hand takes the **blue** box. Step 3's card shifts, red rule draws in, correction line appears beneath the instruction | *"Wrong object. That's the blue box. Step three needs the red box."* |
| 0:55 | **Recovery** | Blue goes back, red is placed. Red rule fades, step 3 collapses green | *"Correct. Next: pick up the yellow box."* |
| 1:08 | **Skipped step** | Operator places the yellow box without picking it up first. Step 4 goes **amber and stays open**; step 5 completes | *"Step four was skipped. Return to step four: pick up the yellow box."* |
| 1:22 | **Repair** | Step 4 performed. Amber rule cross-fades green, card collapses | *"Step four recovered."* |
| 1:35 | **Pause** | Video freezes, clock stops, the spine desaturates slightly | *"Experiment paused."* |
| 1:45 | **Resume** | Everything returns; current step re-announced | *"Resuming. Step six: close the container."* |
| 1:55 | **Completion** | Spine collapses into a summary card: 6 steps · 2 errors · 1 step recovered · 01:43 | *"Experiment complete. Six steps, one error corrected, one step recovered."* |
| 2:10 | **The log** | Open `log.txt` on screen — it reads exactly as the run happened | — |
| 2:20 | **Manual override** *(if a judge asks)* | Press `~`, fire any event live, show the engine react | — |
| 2:25 | **The honest close** | *"Perception is simulated in this prototype — the video is a recording, not an interpretation. It emits the same event structure real CV would, so the ML drops in behind that one interface. The sequence validator is deterministic and real, because procedure checking should be provable, not probabilistic."* | — |

**Why it reads as intelligent with no ML:** the visible reasoning is the *document*. Watching step 4 go amber
and later go green is something no classifier does — it's the system holding a model of what was supposed to
happen, and repairing it. That single beat carries the whole pitch.

---

## 9. Minimal testing plan

One file, `tests/test_engine.py`, six tests, ~80 lines. Each feeds a list of actions into the engine and asserts
the resulting step states and decision types.

1. **Happy path** — all six in order → every step `done`, status `complete`
2. **Wrong object** — `PICK_BLUE_BOX` at step 2 → `WRONG_OBJECT`, index unchanged, then the correct action recovers
3. **Wrong action** — `PICK_RED_BOX` at step 3 → `WRONG_ACTION`, index unchanged
4. **Skipped step** — `PLACE_YELLOW_BOX` at step 4 → step 4 `skipped`, step 5 `done`; then `PICK_YELLOW_BOX` → step 4 `done_late`
5. **Pause / resume** — events during `paused` are ignored; resume restores the same current step
6. **Completion** — final step sets `status == "complete"` and the summary counts match

Run them before Day 1 hour 3.75 is over and after any engine edit. **No UI tests, no API tests, no
integration tests, no coverage target.** The goal is confidence in the one component whose bugs would be
invisible until they're on screen in front of the panel.

---

## 10. Exact implementation order

```
DAY 1
 1. Skeleton: git init, uv venv (3.11), 3 deps, folders
 2. models.py     — ActionEvent, Decision, RunState
 3. experiment.py — 6 steps + blue distractor in the vocabulary
 4. engine.py     — 6 classification rules, 4 statuses, done_late
 5. tests/test_engine.py — the 6 tests; green before continuing
 6. perception.py — scenario replay keyed to t + manual inject
 7. scenarios/demo.json — all 10 beats, realistic timings
 8. guidance.py   — Decision -> {headline, detail, speech}
 9. log.py        — runs/<id>/log.txt + log.json
10. main.py       — POST start|pause|resume|reset, POST /event, WS /ws, {t} clock ingest
11. Throwaway HTML — verify the whole scenario runs and the log is right
      ══ DAY 1 DONE: it works, it just isn't pretty ══

DAY 2
12. Vite + React + Framer Motion; tokens.css; vendored woff2; dev proxy
13. useWebSocket + useReducer; render raw state to confirm the pipe
14. The procedure document — spine, expanded current, collapsed done, amber skipped
15. Video panel + currentTime -> WS clock; Start/Pause bound to video.play()/pause()
16. Voice: speak on decision + silent priming inside the Start handler + mute
17. Event log, observed-action panel, alert states, header, controls, SIMULATED badge
18. Record assets/experiment.mp4; retime demo.json against it
19. Manual trigger panel behind `~`
      ══ DAY 2 DONE: convincing and interactive ══

DAY 3
20. Typography + spacing pass (the polish is mostly here, not in motion)
21. Framer Motion pass — only the 8 moments in §7
22. Completion summary + download log
23. Idle state + About panel (what's simulated, PROVISIONAL sequence note)
24. Offline check, run.sh, README
25. Run twice, fix blockers, FREEZE
26. Screen-record a perfect run
27. Slides: problem / architecture / real vs simulated / ML roadmap
```

---

## 11. Definition of done

Ten observable checks. Not thirty.

- [ ] The 2–3 minute demo runs start to finish without a restart
- [ ] All five error/state beats demonstrate: wrong object, wrong action, skipped step, pause, resume
- [ ] A skipped step, performed later, visibly turns from amber to green
- [ ] Voice speaks the next step on start and after every decision — **from a cold page load**
- [ ] The procedure document updates correctly and the video stays in sync
- [ ] `runs/<id>/log.txt` is readable and matches what happened on screen
- [ ] `pytest` — 6 tests green
- [ ] The whole demo works with **Wi-Fi off**
- [ ] The UI would not embarrass you next to a funded startup's screenshot
- [ ] `PERCEPTION · SIMULATED` is visible, and you can answer "how much is real?" in one sentence

---

## 12. Explicitly forbidden from entering scope

**Infrastructure:** any database · Docker · Redis · message queues · WebRTC/RTSP/UDP streaming · camera capture ·
video recording · MJPEG · nginx · auth · settings pages · multi-user · multiple experiments · an experiment
editor · a CLI framework · an event bus · dependency injection · import-lint · CI.

**ML/CV:** OpenCV in the demo path · MediaPipe · YOLO · PyTorch · ONNX · any training · any dataset collection ·
any LLM · any accuracy claim that has not been measured.

**Frontend:** Tailwind · any component library (MUI, shadcn, Chakra, Ant) · any icon package · any chart library ·
Redux/Zustand/Jotai/react-query · react-router · CSS-in-JS · a second font beyond the two · dark mode ·
a theme switcher · mobile layout · Storybook · any animation beyond the eight moments in §7.

**Process:** TDD · >6 tests · UI or API tests · coverage targets · code review gates · per-day commit
requirements · rehearsal counts as an acceptance gate · refactoring the engine after Day 1.

**Product:** a second experiment · a settings panel · user profiles · export formats beyond txt/json ·
onboarding · help tooltips · a landing page.

**The rule:** if it isn't in P0/P1, or it doesn't visibly change what a judge sees in 150 seconds, it does not
get built. If Day 3 finishes early, the answer is *rehearse and rest*, not *add a feature*.
