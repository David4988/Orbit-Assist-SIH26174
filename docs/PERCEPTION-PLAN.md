# ORBIT ASSIST — Perception & ML Integration Plan
**SIH26174 · ISRO · planning document, no implementation** · 2026-08-31

Companion docs: [`PLAN.md`](./PLAN.md) (product plan) ·
[`SIH26174-problem-statement.md`](./SIH26174-problem-statement.md) ·
[`ENVIRONMENT.md`](./ENVIRONMENT.md)

**Headline finding:** the entire next stage — real webcam, real hand, real pinch,
real drag-and-drop, real `ActionEvent` — requires **zero model training and zero
dataset**. It needs exactly one pretrained model, which is a public, unauthenticated
download. Training only becomes necessary at Phase 3C, and only if classical CV
proves insufficient. Everything before that is geometry.

---

## 1. Current perception architecture

```
scenarios/demo_master.json ─┐
                            ├─► perception.py ─► ActionEvent ─► engine.py ─► guidance ─► WS ─► React
POST /api/event (manual) ───┘
```

What exists today, verified in the codebase:

| Element | Location | Note |
|---|---|---|
| `ActionEvent` | `backend/models.py` | `{action, confidence, timestamp, source}` — the only shape crossing the perception boundary |
| `ScenarioPlayer` | `backend/perception.py` | replays scripted events against a clock |
| `manual_event()` | `backend/perception.py` | constructs a one-off event |
| `POST /api/event` | `backend/main.py:186` | **already accepts an externally produced ActionEvent** |
| clock ingest | `WS {type:"clock", t}` | frontend reports video position; backend advances the scenario |
| vocabulary | `backend/experiment.py` | `VERBS = OPEN CLOSE PICK PLACE`, `OBJECTS = CONTAINER RED_BOX YELLOW_BOX BLUE_BOX` |

**The integration seam already exists.** `POST /api/event` was built as a manual
override for judge questions; it is exactly the endpoint a live perception module
needs. Nothing in `engine.py`, `guidance.py` or `log.py` has to change to accept
real perception — that is the payoff of the Phase 0 architecture.

### The three layers, and why they stay separate

| Layer | Question | Nature | Where it will live |
|---|---|---|---|
| **Perception** | "What is in the scene?" | Learned (pretrained) or classical CV | Browser, per-frame |
| **Interaction interpretation** | "Which object did the user interact with, and how?" | Deterministic geometry + FSM | Browser, per-frame |
| **Procedural reasoning** | "Was that correct at this step?" | Deterministic FSM | Backend, per-event |

The middle layer is the one most projects collapse into the other two. Keeping it
separate is what lets perception change from virtual → colour → detector → temporal
model without the procedure engine ever being touched.

---

## 2. Recommended roadmap

| Phase | Capability | Training? | Dataset? | Est. effort |
|---|---|---|---|---|
| **0** | Simulated events | No | No | ✅ done |
| **1** | Real hand landmarks + pinch | **No** (pretrained) | **No** | 1–2 days |
| **2** | Virtual object drag/drop → real ActionEvent | **No** | **No** | 1–2 days |
| **3A** | Physical objects via colour segmentation | **No** | No (calibration only) | 2–3 days |
| **3A′** | Physical objects via fiducial markers | **No** | No | 1 day |
| **3C** | Physical objects via custom detector | **Yes** | ~400–800 self-shot frames | 1–2 weeks |
| **4** | Temporal action recognition | **Yes** | ~30–40 self-shot sessions | 2–4 weeks |
| **5** | Pose, anomaly detection, orientation robustness, optional 3D HMR | Mixed | Large | SIH-final scope |

**Recommended next stage: Phases 1 + 2 only.** They convert the product from
"simulated perception" to "genuinely perceiving a real human hand and producing real
events" — the single largest credibility jump available — at zero ML risk.

---

## 3. Phase 1 — hand tracking design

### Model choice: MediaPipe Hand Landmarker (Tasks Vision)

Verified from Google's official documentation:

- **21 hand-knuckle landmarks** per hand, in normalised image coordinates
- Also outputs **world landmarks** (metric, wrist-relative) and **handedness** (left/right)
- Benchmarked at **17.12 ms CPU / 12.27 ms GPU on a Pixel 6** — i.e. 58–81 fps on a
  mid-range 2021 phone. Phone-first is a measured fact here, not an aspiration.
- Package: `@mediapipe/tasks-vision` (npm), WASM + WebGL delegate
- Model bundle: `hand_landmarker.task` (float16), public URL, **no authentication**

We consume this model. **We never train a hand model** — that problem is solved,
and re-solving it would be the definition of overengineering.

### Landmark indices we actually use

| Index | Point | Used for |
|---|---|---|
| 0 | Wrist | hand scale normalisation |
| 4 | Thumb tip | pinch distance |
| 8 | Index fingertip | pinch distance, **the interaction cursor** |
| 9 | Middle finger MCP | hand scale normalisation |
| 12, 16, 20 | Middle/ring/pinky tips | optional whole-hand grab detection |

### Pinch detection — geometry, not learning

```
pinch_raw   = ‖L4 − L8‖                       (thumb tip to index tip)
hand_scale  = ‖L0 − L9‖                       (wrist to middle MCP)
pinch_norm  = pinch_raw / hand_scale          (scale- and depth-invariant)

pinching    = hysteresis(pinch_norm, close = 0.32, open = 0.45)
             debounced over N = 3 consecutive frames
```

Three details that matter, and are the difference between "works" and "flickers":

1. **Normalise by hand scale.** A raw pixel distance changes with how far the hand is
   from the camera. Dividing by wrist→MCP makes the threshold depth-invariant. Without
   this, the threshold has to be retuned every time the user leans in.
2. **Hysteresis, not a single threshold.** Closing at 0.32 and opening at 0.45 stops
   the state oscillating when the fingers hover near the boundary.
3. **N-frame debounce.** A single noisy frame must not emit an event. Combined with
   the backend's existing per-action behaviour, this suppresses event storms.

The interaction cursor is **landmark 8** (index fingertip), not the hand centroid —
it is what the user perceives themselves as pointing with.

### Where it runs: the browser, not the backend

This is the significant architectural recommendation of this document.

| Reason | Detail |
|---|---|
| **Phone-first** | A PWA using `@mediapipe/tasks-vision` runs on phone, tablet and laptop with one codebase and no native build |
| **Matches the PS** | ISRO's statement explicitly calls for edge processing rather than streaming raw video. Running perception client-side and sending only ~100-byte events **is** that architecture, demonstrated |
| **Hardware** | This dev machine is an Intel Mac with no usable GPU; the browser's WebGL delegate is faster here than CPU Python would be |
| **Dependency reality** | Python `mediapipe` on x86_64 macOS caps at **0.10.21** (verified in `ENVIRONMENT.md`); the web package has no such ceiling |
| **Zero downstream change** | The backend already accepts `POST /api/event` |
| **Privacy/bandwidth** | Video never leaves the device |

**Offline requirement:** vendor `hand_landmarker.task` (~7–8 MB) and the WASM binaries
into `frontend/public/models/` at build time. Loading them from Google's CDN at runtime
would silently break the offline demo — which is an explicit acceptance criterion.

---

## 4. Phase 2 — virtual object interaction design

### The critical design question, answered

> Can webcam → hand landmarks → pinch → known virtual object coords → drag/drop →
> ActionEvent be implemented **without training**?

**Yes, completely.** The chain has exactly one learned component, and it is pretrained:

| Step | Mechanism | Learned? |
|---|---|---|
| webcam → frames | `getUserMedia` | No |
| frames → 21 landmarks | MediaPipe Hand Landmarker | **Pretrained — we do not train it** |
| landmarks → pinch state | normalised distance + hysteresis | No — geometry |
| landmarks → cursor position | landmark 8, mapped to canvas coords | No — a coordinate transform |
| cursor + object position → "which object" | point-in-rect hit test | No — geometry |
| object + zone → "which zone" | point-in-polygon | No — geometry |
| (pinch × hit × zone) over time → PICK/PLACE | finite state machine | No — rules |

**The reason no training is needed is that virtual objects have no perception problem
at all.** We render them, so we know their identity and position exactly, to the pixel,
at every frame. There is nothing to infer. Object localisation error is precisely zero.

The only genuinely hard vision problem — "where is the red box and is that really the
red box?" — is *defined out of existence* by making the object virtual. What remains is
hand tracking (solved by a pretrained model) and arithmetic.

### Interaction state machine

```
        ┌──────────────────────────────────────────────┐
        ▼                                              │
     IDLE ──pinch starts inside object O──► HOLDING(O) ─┤
        ▲                                    │         │
        │                                    │ cursor moves
        │                                    ▼
        │                              (object follows cursor)
        │                                    │
        │        pinch releases              │
        ├──── outside any zone ──────────────┤   → emit PICK_O … then DROP (no event)
        └──── inside zone Z ─────────────────┘   → emit PLACE_O

  On entering HOLDING(O)  → emit PICK_<O>
  On release inside Z     → emit PLACE_<O>
  On release outside Z    → return object to origin, emit nothing
```

Emission rules, chosen deliberately:

- `PICK_<OBJECT>` fires **on grab**, not on release — it matches what the operator
  perceives as having happened, and it is what the procedure engine expects at the
  `pick_red` step.
- `PLACE_<OBJECT>` fires **only when released inside a valid zone**. Dropping in empty
  space is a non-event, not an error — the user simply changed their mind. Emitting an
  error there would make the system feel punitive and noisy.
- `OPEN_CONTAINER` / `CLOSE_CONTAINER` map to a pinch-and-drag on the lid affordance,
  or a dwell gesture. These two verbs have no object-transport semantics, so they need
  their own small affordance rather than being forced into the pick/place model.

### Confidence — genuine, not decorative

With virtual objects, confidence should be **real and computed**, never authored:

```
confidence = w1 · landmark_visibility        (from MediaPipe)
           + w2 · pinch_margin               (how far past threshold)
           + w3 · hit_test_margin            (cursor distance from object centre / radius)
```

Clamped to [0.5, 0.99]. This matters: the UI already displays a confidence number, and
a number that varies meaningfully with the quality of the observation is honest, whereas
a constant 0.94 is theatre. It also gives us something real to threshold on later.

### Scene definition

Object and zone geometry belongs in a data file, not code — mirroring how
`experiment.py` isolates the step sequence:

```jsonc
// config/scene.json
{
  "space": "normalised",            // 0..1 in camera frame; resolution-independent
  "objects": [
    { "id": "RED_BOX",    "shape": "rect", "x": 0.22, "y": 0.55, "w": 0.10, "h": 0.10 },
    { "id": "YELLOW_BOX", "shape": "rect", "x": 0.36, "y": 0.55, "w": 0.10, "h": 0.10 },
    { "id": "BLUE_BOX",   "shape": "rect", "x": 0.50, "y": 0.55, "w": 0.10, "h": 0.10 }
  ],
  "zones": [
    { "id": "RED_MARKER",    "accepts": ["RED_BOX"],    "x": 0.68, "y": 0.30, "w": 0.16, "h": 0.16 },
    { "id": "YELLOW_MARKER", "accepts": ["YELLOW_BOX"], "x": 0.68, "y": 0.55, "w": 0.16, "h": 0.16 },
    { "id": "CONTAINER",     "accepts": ["*"],          "x": 0.10, "y": 0.15, "w": 0.30, "h": 0.22 }
  ]
}
```

Normalised coordinates mean the same scene file works on a laptop webcam and a phone
camera at different resolutions and aspect ratios.

**Note on `accepts`:** the zone knows which objects belong in it, but it must **not**
reject wrong ones. Placing the yellow box on the red marker has to be physically
possible, or the procedure engine can never observe a wrong-object error. Perception
reports what happened; only the engine judges it. This is the layer separation being
load-bearing rather than decorative.

---

## 5. Phase 3 — physical object interaction design

### What changes when objects become physical

| Capability | Virtual (Phase 2) | Physical (Phase 3) |
|---|---|---|
| Object identity | Known by construction | **Must be perceived** |
| Object position | Known by construction | **Must be perceived and tracked** |
| Object state (held / at rest) | Known by construction | **Must be inferred** |
| Hand tracking | MediaPipe | MediaPipe (unchanged) |
| Zone geometry | Config file | Config file, after camera calibration |
| Occlusion | Impossible | **A constant problem — the hand covers the object exactly when grabbing it** |

Exactly one new capability is required: **object identity + position from the image.**
Everything else carries over.

### The three options, compared

**A. Classical CV — HSV colour segmentation**

Convert to HSV, threshold per calibrated colour range, morphological open/close, largest
contour per colour → centroid + area + bounding box.

- Zero training, zero dataset, ~2 ms/frame, runs in plain canvas JS or OpenCV.js
- Identity comes free from hue; position from the centroid
- Genuinely appropriate here — the objects *are* colour-coded, so this is not a hack
- **Fails on:** lighting change between calibration and demo, shadows, specular
  highlights, coloured background, and **skin-tone hue overlapping red and yellow** —
  which is a real and specific problem for this exact object set

**A′. Fiducial markers — ArUco / AprilTag** *(the option most teams forget)*

Attach a small printed marker to each box and to the table plane.

- Zero training, zero dataset
- Gives **exact identity and full 6-DoF pose**, not just a centroid
- Essentially immune to lighting and colour problems
- The table-plane marker also solves camera calibration, which Phase 3 needs anyway
- Real payload hardware frequently *does* carry fiducials, so this is defensible
  engineering rather than a shortcut
- **Costs:** requires physically modifying the objects; markers must stay visible
  (occlusion still applies); in-browser support means a JS port such as js-aruco2,
  since standard OpenCV.js builds usually exclude the contrib `aruco` module

**B. Pretrained object detector — not viable here**

A COCO-trained detector (YOLO, EfficientDet, MobileNet-SSD) has **no class matching our
objects**. COCO's 80 classes contain no generic "box" or "container"; the nearest are
`book`, `cell phone`, `bowl`. A pretrained detector would return either nothing or
confident nonsense.

Open-vocabulary detectors (OWL-ViT, Grounding DINO) *would* handle "a red box" — but
they are large, slow on CPU, unnecessary for four known rigid objects, and squarely in
the "giant vision model" category ruled out of scope. **Skip option B entirely.** This
is a non-obvious conclusion and worth stating explicitly to anyone who assumes
"pretrained detector" is the default answer.

**C. Custom-trained detector**

Fine-tune YOLOv8n / YOLO11n (or an equivalent small detector) on our own annotated
frames, export to ONNX or TFLite for browser/phone inference.

- ~400–800 annotated frames is realistic for four rigid, visually distinct objects
- Robust to lighting, background and partial occlusion in a way colour never is
- **Costs:** a real dataset, real annotation time, a training loop, an export pipeline,
  and a ~6–12 MB model to ship

### Recommendation

**Start with A′ (fiducials) for robustness, or A (colour) for narrative — then C only
if measurement proves it necessary.**

The opinionated version: **build A (colour) first**, because it tells the better story
to a selection panel and needs no physical modification, but **instrument it** (§14) so
you have a measured failure rate. Keep A′ implemented behind a flag as the reliability
fallback for a demo in unknown lighting. Move to C only when you have numbers showing
A fails — never on the assumption that it will.

**Hand–object interaction with physical objects**, once identity and position exist:

```
holding(O) ⇐ pinch_active
           ∧ ‖cursor − centroid(O)‖ < r
           ∧ object O's blob has shrunk or vanished (occluded by the grasping hand)
           over N consecutive frames
```

The occlusion that makes physical perception hard is itself the strongest available
grab signal — the object disappearing *under a pinching hand at its last known location*
is precisely what picking it up looks like to a fixed camera. Track last-known position
through the occlusion rather than deleting the object.

---

## 6. When object detection becomes necessary

A precise answer, since this drives all dataset cost:

**Object detection is necessary exactly when object position or identity is not
recoverable by construction or by a simpler cue.**

| Situation | Detection needed? | Why |
|---|---|---|
| Virtual/rendered objects | **No** | Position is authored; error is zero |
| Physical objects, fixed positions, never moved | **No** | Calibrate once into `scene.json` |
| Physical objects, colour-coded, controlled lighting | **No** | Colour segmentation suffices |
| Physical objects with fiducial markers | **No** | Marker decoding gives exact identity + pose |
| Physical objects, uncontrolled lighting/background | **Yes** | Colour thresholds break |
| Objects not visually separable by colour | **Yes** | Two same-coloured tools, tool vs tool |
| Novel objects introduced at runtime | **Yes** | Nothing pre-calibrated applies |
| Deformable/articulated objects (cables, bags, lids) | **Yes** | No stable blob or marker |
| Real ISRO payload hardware | **Yes** | Metallic, similar-coloured, cluttered rack |

For the SIH-final system with real payload hardware, option C is unavoidable. For every
stage before that, it is avoidable — and avoiding it is the correct engineering call.

---

## 7. When action recognition becomes necessary

**Rules are sufficient when an action is fully characterised by an observable state
change. A temporal model becomes necessary when it is not.**

| Action type | Example | Rules enough? |
|---|---|---|
| Object transport | pick, place, move | **Yes** — defined by grasp + position change |
| Binary object state | open/close a lid | **Yes** — if the state is visible |
| Manner-dependent | stir vs shake, tighten vs loosen | **No** — identical endpoints, different motion |
| No object signature | inspect, read a display, wait | **No** — nothing changes in the scene |
| Tool actions with invisible effect | pipetting, soldering, calibrating | **No** |
| Anomaly / "something unexpected" | any unmodelled activity | **No** — rules only recognise what they enumerate |

**For the current six-step box procedure, rules are not merely sufficient — they are
strictly better than a learned model.** Every step is object transport or a visible
binary state. A temporal model would add error, require data we do not have, and destroy
explainability, in exchange for nothing. Saying this clearly is a stronger technical
position than adding a model to look sophisticated.

### Model comparison, for when it does become necessary

| Approach | Data needed | CPU/phone real-time | Explainable | Verdict |
|---|---|---|---|---|
| **Rule/FSM** | none | trivially | fully | **Start here. Stay here as long as possible.** |
| **Feature classifier** (RF / gradient boosting on windowed features) | ~500–2 000 labelled windows | yes | mostly (feature importance) | **First learned step.** Cheap, strong baseline, easy to debug |
| **TCN** (dilated 1-D conv) | ~2 000–5 000 windows | yes (~50 k params) | partially | **Best learned option** at our data scale — handles variable timing, small, fast |
| **GRU / LSTM** | similar to TCN | yes | poorly | No advantage over a TCN here; harder to train, slower per step |
| **Small temporal transformer** | 10 000+ windows | marginal | poorly | **Overkill.** Will overfit at our scale |

**Recommended progression: rules → feature classifier → TCN. Never a transformer at this
data scale.** And each step only after measurement shows the previous one failing.

Feature vector per frame, when we get there: 21 hand landmarks (normalised, wrist-relative)
+ per-object position + cursor-to-object distances + zone occupancy one-hot + velocity +
pinch state. Roughly 80–120 dimensions, windowed over ~1.5 s.

---

## 8. Dataset requirements by phase

The central table. **"No dataset" is the correct answer far more often than expected.**

| Component | Dataset needed? | Pretrained option? | Public data relevant? | Manual download likely? | Custom data needed? | Recommended approach |
|---|---|---|---|---|---|---|
| Hand landmarks | **No** | **Yes — MediaPipe Hand Landmarker** | No (only for training hand models, which we won't) | No — public direct URL | No | Use pretrained, vendor offline |
| Pinch / grab gesture | **No** | N/A | No | No | No | Geometry on landmarks + hysteresis |
| Virtual object position | **No** | N/A | No | No | No | Known by construction |
| Virtual interaction → event | **No** | N/A | No | No | No | Deterministic FSM |
| Physical object, colour | **No** | N/A | No | No | Calibration frames only (~20–30, not a dataset) | HSV + `calibration.json` |
| Physical object, fiducial | **No** | N/A | No | No | No | ArUco/AprilTag decode |
| Physical object, detector | **Yes** | No usable one (COCO lacks the classes) | **No** | No | **Yes — ~400–800 frames** | Fine-tune YOLOv8n/YOLO11n on self-shot data |
| Temporal action model | **Yes** | No | Marginal (Assembly101 closest, still wrong objects) | Gated — see §9 | **Yes — 30–40 sessions** | Self-collect; TCN |
| Body pose | **No** | **Yes — MediaPipe Pose** | No | No | No | Use pretrained |
| Anomaly / unknown action | **Yes** | No | No | No | Yes — nominal sessions only | Score novelty against nominal feature distribution |
| 3D HMR | **No** (we won't train) | Yes (HMR2-class) | No | Model weights, some gated | No | Out of scope; capability study only |

### Labels we would actually need, if we get to Phase 3C / 4

**Phase 3C (detector):** bounding box + class per object per frame. Classes:
`RED_BOX`, `YELLOW_BOX`, `BLUE_BOX`, `CONTAINER`, optionally `HAND`. ~400–800 frames
sampled from 8–12 short videos (sample every ~10th frame — adjacent frames are
near-duplicates and add nothing). Annotation: ~1.5–3 hours in CVAT or Label Studio.

**Phase 4 (temporal):** temporal segments, not frames —
`{start_s, end_s, verb, object, label}`. **This is the same JSON shape as our existing
`scenarios/*.json`.** That is not a coincidence to leave implicit: the scenario files we
already wrote for the simulated demo *are* the annotation schema, and the evaluation
harness in §14 is the same code path. ~30–40 sessions × ~7 events ≈ 250 labelled
segments. Annotation: ~10 min per session.

### Variation that matters (and what doesn't)

Matters: lighting (bright / dim / side-lit), 3–6 actors with different hand size and skin
tone, sleeve vs bare forearm, left- and right-handed execution, camera height, background
clutter, and — the one specific to BAS — **camera roll at 0° / 90° / 180°**, since there
is no fixed "up" in orbit.

Does not meaningfully matter: frame rate above 30 fps, resolution above 720p, colour
grading. Do not spend collection budget there.

---

## 9. Dataset accessibility matrix

| Asset | Accessibility | Notes |
|---|---|---|
| **`hand_landmarker.task`** | ✅ **Directly downloadable by Claude Code** | `storage.googleapis.com/mediapipe-models/...` — public, no auth |
| **`@mediapipe/tasks-vision` + WASM** | ✅ **Directly downloadable** (npm) | Vendor into the repo for offline |
| **MediaPipe Pose model** | ✅ **Directly downloadable** | Same host, no auth |
| **YOLOv8n / YOLO11n pretrained weights** | ✅ **Directly downloadable** | Only a *starting point* for fine-tuning; check the licence — Ultralytics weights are AGPL-3.0, which has implications for a submitted project |
| **Our own object-detection frames** | 🔴 **Must be manually collected** | See below |
| **Our own action-recognition sessions** | 🔴 **Must be manually collected** | See below |
| **Assembly101** | 🔴 **Gated — requires form/approval** | Closest public analogue (procedural assembly, hand-object). Still the wrong objects and wrong procedure. **Not recommended.** |
| **EPIC-KITCHENS** | 🟡 Public direct download, but hundreds of GB | Egocentric kitchen. Wrong viewpoint, wrong domain. **Not recommended.** |
| **HOI4D** | 🔴 Registration required | Hand-object interaction. **Not recommended.** |
| **EgoHands / FreiHAND / HaGRID** | 🟡 Public | All exist to *train hand models*. We use a pretrained one. **Not needed.** |

**Deliberate conclusion: no public dataset should be downloaded for this project.**
Every one of them is either for a problem we've solved with a pretrained model, or for
a domain that doesn't match our objects and procedure. Downloading them would consume
days and the ~6.7 GB of free disk on this machine for no measurable gain.

### 🔴 MANUAL USER STEP REQUIRED — custom data collection

Claude Code cannot collect this. It requires a physical camera, physical objects and a
human performing the procedure. When Phase 3C or Phase 4 is reached, you would need to:

1. **Set up:** fixed webcam on a tripod, ~60 cm above a plain table. Place the container,
   the red, yellow and blue boxes, and two marked zones.
2. **Record 8–12 short videos** (Phase 3C) or **30–40 full sessions** (Phase 4) using
   `tools/record_demo.sh`, varying lighting, actor, sleeves, handedness and camera roll
   per §8.
3. **Store to external storage** — this machine has ~6.7 GB free; 40 sessions at 720p is
   several GB.
4. **Annotate:** Phase 3C — draw boxes in CVAT/Label Studio, export YOLO format.
   Phase 4 — mark event times per session in the existing `scenarios/*.json` shape.
5. **Hand back** the annotated directory; everything downstream can then be automated.

Nothing in Phases 1, 2, 3A or 3A′ requires any of this.

---

## 10. Pretrained model options

| Model | Task | Runtime | Size | Use it? |
|---|---|---|---|---|
| **MediaPipe Hand Landmarker** | 21 landmarks + handedness + world coords | Web (WASM/WebGL), Python, Android, iOS | ~7–8 MB | ✅ **Yes — Phase 1 core** |
| MediaPipe Pose Landmarker | 33 body landmarks | same | ~9–30 MB | Phase 5 only |
| MediaPipe Gesture Recognizer | 7 canned gestures | same | ~8 MB | ❌ No — its gesture set isn't ours; our pinch is better done as geometry |
| MediaPipe Object Detector (COCO) | 80 COCO classes | same | ~6 MB | ❌ No — **no matching class** |
| YOLOv8n / YOLO11n | detection | ONNX/TFLite export | ~6–12 MB | Only as a Phase 3C fine-tuning base; check AGPL |
| OWL-ViT / Grounding DINO | open-vocabulary detection | GPU realistically | 600 MB+ | ❌ No — out of scope, out of budget |
| HMR2 / 4DHumans | 3D human mesh | GPU | large | ❌ Not in scope |

---

## 11. Browser / PWA / mobile deployment comparison

| Target | Runtime | Perf for our workload | Effort | Offline | Verdict |
|---|---|---|---|---|---|
| **Browser / PWA** | `@mediapipe/tasks-vision`, WASM + WebGL | 12–17 ms/frame on a Pixel 6 | **Low** — one codebase | Yes, if models are vendored | ✅ **Recommended — primary target** |
| Browser | TensorFlow.js | Slower than MediaPipe WASM for this task | Medium | Yes | Only if we need a custom model TFJS supports better |
| Browser | ONNX Runtime Web | Good for custom ONNX models | Medium | Yes | Phase 3C/4 custom models |
| Android/iOS native | MediaPipe Tasks native / TFLite | Best possible | **High** — two more codebases | Yes | Not justified; PWA is close enough |
| Mobile | ONNX Runtime Mobile | Good | High | Yes | Only if native is already required |
| Laptop | Python `mediapipe` + OpenCV | Fine, but **pinned to 0.10.21 on this Intel Mac** | Low | Yes | Useful for offline batch evaluation (§14), not for the live demo |

**Recommendation: browser-first, PWA-packaged.** One implementation serves laptop demo
and phone/tablet future. The procedure engine stays in FastAPI and remains completely
independent of the inference runtime — and could later be ported to TypeScript and run
fully on-device if a zero-backend deployment is ever wanted. That portability is already
guaranteed by the engine being pure (no I/O, no clock, no framework imports).

---

## 12. Recommended technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Hand tracking | **MediaPipe Hand Landmarker via `@mediapipe/tasks-vision`** | Pretrained, phone-real-time, offline-capable |
| Where perception runs | **Browser (client-side)** | Phone-first; matches the PS's edge-processing requirement; avoids the Intel-Mac Python ceiling |
| Pinch detection | **Normalised distance + hysteresis + 3-frame debounce** | No training; depth-invariant; non-flickering |
| Virtual objects | **`config/scene.json`, normalised coords** | Zero perception error; resolution-independent |
| Interaction logic | **Explicit FSM in `interaction.js`** | The single place allowed to emit `ActionEvent` |
| Physical objects (first) | **HSV colour segmentation**, fiducials behind a flag | Lowest complexity that is plausibly sufficient |
| Physical objects (if measured to fail) | **Fine-tuned YOLOv8n/YOLO11n → ONNX** | Only after evidence |
| Temporal model (if ever needed) | **TCN** | Best accuracy-per-sample at our data scale |
| Transport | **Existing `POST /api/event`** | Already built; no backend change |
| Model hosting | **Vendored in `frontend/public/models/`** | Runtime CDN fetch would break the offline demo |
| Evaluation | **Replay harness reusing `scenarios/*.json`** | Ground truth and simulated input share one format |

---

## 13. Data collection strategy for the SIH-final stage

Only relevant from Phase 3C onward. Summarised; full version in
[`PLAN-v1-archive.md`](./PLAN-v1-archive.md) §11.

- **Volume:** 30–40 sessions — 20 nominal, 12 error runs (3 per error class), 6 adversarial
  (occluded, fumbled, two-handed, dropped).
- **Actors:** 4–6, varying hand size, skin tone, sleeve, handedness.
- **Conditions:** 3 lighting × 2 camera heights × 2 backgrounds, plus camera roll
  0°/90°/180° for orientation robustness.
- **Split by session and actor, never by frame.** 60/20/20, holding out at least one
  actor and one lighting condition entirely. Frame-level splits leak between adjacent
  frames and will manufacture a fake 99%.
- **Format:** temporal segments in the existing scenario JSON shape; YOLO-format boxes
  for the detector subset.
- **Budget:** ~4–6 hours recording, ~6–10 hours annotation, external storage.

---

## 14. Evaluation strategy

Rule-based systems still need measurement — and this is where the honesty rule bites,
since we may never claim an unmeasured number.

**Ground truth:** hand-label each recorded session's true event times in the existing
scenario JSON format. Replay the video through the perception module offline; compare
emitted events to the labels with a **±0.5 s matching window**.

| Metric | Definition | Target for a credible Phase 2/3 |
|---|---|---|
| **Event precision** | correct events / emitted events | > 0.95 |
| **Event recall** | correct events / true events | > 0.90 |
| **Identity accuracy** | right object, given a correct detection | > 0.98 |
| **Latency** | physical action → `ActionEvent` emitted | < 300 ms |
| **False positives per idle minute** | spurious events while hands move without intent | **< 1** |
| **Sequence success rate** | runs where the engine reaches the correct final state | > 90% |

**False positives per idle minute is the metric that decides whether the demo survives.**
A system with excellent recall that fires a spurious `PICK_BLUE_BOX` while the operator
gestures at the screen will look broken in front of a panel. Measure it explicitly, with
the camera on and the operator deliberately *not* performing the procedure.

The replay harness is the same code path as the scenario player, so the evaluation
infrastructure is largely free.

---

## 15. Major technical risks

| # | Risk | Sev | Lik | Mitigation | Fallback |
|---|---|---|---|---|---|
| 1 | **Pinch ambiguous under a top-down camera** — thumb/index foreshortened, distance collapses | High | High | Normalise by hand scale; use world landmarks; require the hit test to co-fire; angle the camera ~30° off vertical | Whole-hand grab (all fingertips → palm) instead of pinch |
| 2 | **Spurious events from incidental hand motion** | High | High | Hysteresis + N-frame debounce + require pinch *inside* an object; measure FP/idle-minute | Raise thresholds; require a short dwell before grab |
| 3 | **Skin tone overlaps red/yellow hue** in HSV (Phase 3A) | High | High | Gate on saturation and value, not hue alone; exclude the hand region using MediaPipe's hand mask | Switch to fiducials (A′) |
| 4 | **Occlusion — hand covers object at the moment of grasp** | High | Certain | Treat it as the grab signal; persist last-known position through occlusion | Fiducials on box faces that stay visible |
| 5 | **2D depth ambiguity** — "hand above object" vs "hand touching object" | Med | High | Fixed camera + calibrated table plane; accept in a controlled setup | Require pinch, which implies proximity |
| 6 | **Model fetched from CDN at runtime breaks the offline demo** | High | Med | Vendor `.task` + WASM into `frontend/public/models/`; verify with Wi-Fi off | — |
| 7 | **Camera permission needs HTTPS** (non-localhost) | Med | Med | Demo on `localhost`, which is a secure context | Self-signed cert for LAN/phone testing |
| 8 | Perception work destabilises the working PoC | High | Med | Live perception is an **additional** source behind a switch; simulated mode stays untouched and remains the demo fallback | Flip back to simulated |
| 9 | Phone performance worse than the Pixel 6 benchmark | Med | Med | Cap inference to 15–20 fps; downscale input to 480p | Laptop demo |
| 10 | **Claiming ML we haven't measured** | **Critical** | Med | The About panel already distinguishes real from simulated; update it the moment perception changes; publish §14 numbers or none | — |
| 11 | AGPL contamination from Ultralytics weights (Phase 3C only) | Med | Low | Check licensing before adopting; alternatives exist | Train a small detector on a permissive base |

---

## 16. Proposed module interfaces

`ActionEvent` **does not change.** Only `source` gains new values, and an optional
`evidence` field is added for logging/debugging — never for logic.

```jsonc
{
  "action": "PICK_RED_BOX",
  "confidence": 0.91,
  "timestamp": 12.4,
  "source": "hand",              // "simulated" | "manual" | "hand" | "cv" | "ml"
  "evidence": {                  // optional; logged, never used by the engine
    "cursor": [0.42, 0.58],
    "pinch_norm": 0.28,
    "object_id": "RED_BOX",
    "zone_id": null
  }
}
```

Proposed frontend perception modules — each with one responsibility, and only the last
one allowed to emit an event:

```
frontend/src/perception/
├── handTracker.js     camera + MediaPipe  → HandFrame { landmarks[21], handedness, t }
├── pinch.js           HandFrame           → PinchState { active, strength, cursor }
├── scene.js           loads scene.json    → ObjectRegistry { objects[], zones[] }
├── hitTest.js         cursor + registry   → { objectId | null, zoneId | null }
├── interaction.js     the FSM             → ActionEvent          ◄── the ONLY emitter
└── index.js           wiring + mode switch (simulated | live)
```

Contracts:

```ts
interface HandFrame   { landmarks: [number,number,number][]; handedness: 'Left'|'Right'; t: number }
interface PinchState  { active: boolean; strength: number; cursor: [number, number] }
interface HitResult   { objectId: string | null; zoneId: string | null; margin: number }
type    OnActionEvent = (e: ActionEvent) => void
```

**Rules that keep the layers honest:**
- `handTracker.js` knows nothing about objects, zones or the experiment.
- `interaction.js` knows nothing about *which* step is expected — it reports what
  happened, never whether it was right.
- Nothing in `perception/` imports the experiment definition or the procedure engine.
- The backend contract is unchanged: `POST /api/event`.

Backend changes required for the next stage: **essentially none.** Widen the accepted
`source` values and pass `evidence` through to the log. That is the whole diff.

---

## 17. Implementation tasks — NEXT STAGE ONLY (Phases 1 + 2)

Scope: real webcam, real hand, real pinch, virtual objects, real `ActionEvent`.
No physical-object CV, no training, no dataset. Each task is independently
understandable and independently verifiable.

---

**TASK 1 — Vendor MediaPipe for offline use**
Add `@mediapipe/tasks-vision` to the frontend. Download `hand_landmarker.task` (float16)
and the WASM binaries into `frontend/public/models/`. Confirm the app loads them from
local paths only. **Verify:** the model initialises with Wi-Fi disabled.

**TASK 2 — `handTracker.js`: camera → landmarks**
Open the webcam via `getUserMedia`, run `HandLandmarker` in video mode, emit `HandFrame`
at a capped 15–20 fps. Handle permission denial and no-hand-in-frame gracefully.
**Verify:** landmark stream logs at a steady frame rate with a hand in view.

**TASK 3 — Debug overlay**
Render the camera feed with the 21 landmarks, the hand skeleton, and the index-fingertip
cursor drawn on a canvas. Toggle with a key. This is a development tool, not product UI.
**Verify:** the skeleton visually tracks the hand with no perceptible lag.

**TASK 4 — `pinch.js`: pinch detection**
Implement normalised thumb-to-index distance over wrist-to-middle-MCP, hysteresis
(close 0.32 / open 0.45) and a 3-frame debounce. Expose `PinchState`.
**Verify:** pinching and releasing 20 times produces exactly 20 clean transitions with
no flicker, at two different distances from the camera.

**TASK 5 — `config/scene.json` + `scene.js`**
Define the object and zone geometry in normalised coordinates per §4. Load and expose it
as an `ObjectRegistry`. **Verify:** objects and zones render at the correct positions at
two different window sizes and aspect ratios.

**TASK 6 — `hitTest.js` + hover feedback**
Point-in-rect for objects, point-in-polygon for zones, returning the margin for
confidence. Render a subtle hover state when the cursor is over an object.
**Verify:** hover activates exactly at the drawn object boundary.

**TASK 7 — `interaction.js`: the interaction FSM**
Implement IDLE → HOLDING(O) → release, per §4. Emit `PICK_<OBJECT>` on grab and
`PLACE_<OBJECT>` on release inside a zone; return the object to origin and emit nothing
on release outside any zone. Zones must accept wrong objects. Compute real confidence
from landmark visibility, pinch margin and hit margin.
**Verify:** a full manual run produces exactly the seven events of the demo sequence.

**TASK 8 — Wire events to the backend**
POST each emitted `ActionEvent` to the existing `/api/event`. Widen the backend's
accepted `source` values and pass `evidence` through into the JSON log.
**Verify:** the procedure engine advances, voice fires, and the log records
`source: "hand"` — with no change to `engine.py`.

**TASK 9 — Perception mode switch**
Add a `simulated | live` selector. Simulated mode must remain byte-for-byte the current
behaviour and stay the demo fallback. Update the header badge and the About panel to
state exactly what is real in each mode.
**Verify:** switching modes mid-session is safe; the About panel is accurate in both.

**TASK 10 — Instrumentation**
Record per-event latency (pinch transition → POST) and count events emitted per minute
while the operator deliberately does *not* perform the procedure.
**Verify:** produces a latency figure and a false-positives-per-idle-minute figure.

**TASK 11 — Replay evaluation harness**
Record 5 short sessions. Hand-label true event times in the existing `scenarios/*.json`
format. Replay each recording through the perception modules and report precision,
recall and latency against a ±0.5 s window.
**Verify:** outputs a small metrics table — the first genuinely measured numbers in the
project.

**TASK 12 — Update honesty documentation**
Revise the README and the About panel to reflect the new boundary: hand tracking is a
real pretrained model, interaction is real geometry, objects are still virtual, and no
model has been trained. Include the TASK 11 numbers, or state that none have been
measured yet.
**Verify:** no claim in the repo exceeds what has actually been built and measured.

---

### What this stage deliberately does not do

No physical-object CV · no colour segmentation · no fiducials · no object detection ·
no training · no dataset collection · no downloaded public dataset · no pose estimation ·
no temporal model · no 3D HMR · no native mobile app · no changes to `engine.py`,
`guidance.py` or `log.py` beyond widening one enum and passing one field through.

**Sources:** [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) ·
[Hand landmarks detection for Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) ·
[@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)
