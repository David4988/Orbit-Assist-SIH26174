"""FastAPI application - deliberately small.

Owns the run state, drives the engine from the clock the frontend reports
(the demo video's currentTime), and broadcasts full state snapshots over a
WebSocket. Snapshots rather than deltas: reconnecting is just a re-render.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import engine, guidance
from backend.experiment import EXPERIMENT_NAME
from backend.log import RunLog
from backend.models import ActionEvent
from backend.perception import ScenarioPlayer, list_scenarios, manual_event

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="ORBIT ASSIST")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Session:
    """One demo session. Single-user by design - this is a prototype."""

    def __init__(self) -> None:
        self.state = engine.reset()
        self.player = ScenarioPlayer("demo_master")
        self.mode = "scripted"  # "scripted" (clock drives the scenario) | "live" (hand-driven events only)
        self.log: RunLog | None = None
        self.clients: set[WebSocket] = set()
        self.speech_queue: list[str] = []
        self.lock = asyncio.Lock()

    # ---------- outbound ----------

    def snapshot(self) -> dict:
        speech, self.speech_queue = self.speech_queue, []
        return {
            "experiment": EXPERIMENT_NAME,
            "scenario": self.player.name,
            "run_id": self.log.run_id if self.log else None,
            "mode": self.mode,
            "perception": "HAND TRACKING" if self.mode == "live" else "SIMULATED",
            "state": self.state.to_dict(),
            "speak": speech,
        }

    async def broadcast(self) -> None:
        payload = self.snapshot()
        dead = []
        for ws in self.clients:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    def say(self, text: str) -> None:
        if text:
            self.speech_queue.append(text)

    # ---------- control ----------

    def start(self, scenario: str = "demo_master", mode: str = "scripted") -> None:
        self.mode = mode
        self.player.load(scenario)
        self.player.reset()
        self.state = engine.start(0.0)
        self.log = RunLog(mode=mode)
        self.say(guidance.start_speech(self.state))

    def pause(self) -> None:
        if self.state.status == "running":
            self.state = engine.pause(self.state)
            self.say("Experiment paused.")

    def resume(self) -> None:
        if self.state.status == "paused":
            self.state = engine.resume(self.state)
            self.say(guidance.resume_speech(self.state))

    def reset(self) -> None:
        self.state = engine.reset()
        self.player.reset()
        self.log = None
        self.speech_queue = []

    # ---------- the loop ----------

    def apply(self, event: ActionEvent) -> None:
        """Run one event through engine -> guidance -> log."""
        if self.state.status != "running":
            return

        before_index = self.state.current_index
        self.state, decision = engine.process_event(self.state, event)

        alert = guidance.build_alert(self.state, decision)
        self.state.alert = alert

        step_no = None
        if decision.step_id:
            step_no = next(
                (i + 1 for i, s in enumerate(self.state.steps) if s.id == decision.step_id), None
            )

        if self.log:
            row = self.log.append(
                t=event.timestamp,
                step_no=step_no,
                action=event.action,
                kind=decision.kind,
                confidence=event.confidence,
                source=event.source,
            )
            self.state.events.insert(0, row)

        self.say(guidance.speech_for(self.state, decision))

        if self.state.status == "complete" and self.log:
            self.log.finalise(self.state)

    def tick(self, t: float) -> bool:
        """Advance the clock. Returns True if anything changed.

        In "live" mode the clock only drives the elapsed-time display -
        events come exclusively from POST /api/event (the hand interaction
        FSM). This is what keeps the two timelines from colliding: without
        it, a real PICK_RED_BOX from a pinch-and-drag would land on top of
        the scripted scenario still firing its own PICK_RED_BOX off the
        wall clock."""
        if self.state.status != "running":
            return False
        self.state.t = t
        if self.mode != "scripted":
            return False
        events = self.player.advance_to(t)
        for e in events:
            self.apply(e)
        return bool(events)


session = Session()


# ---------- REST ----------

@app.post("/api/start")
async def api_start(payload: dict | None = None):
    scenario = (payload or {}).get("scenario", "demo_master")
    mode = (payload or {}).get("mode", "scripted")
    async with session.lock:
        session.start(scenario, mode=mode)
        await session.broadcast()
    return {"ok": True, "run_id": session.log.run_id if session.log else None}


@app.post("/api/pause")
async def api_pause():
    async with session.lock:
        session.pause()
        await session.broadcast()
    return {"ok": True}


@app.post("/api/resume")
async def api_resume():
    async with session.lock:
        session.resume()
        await session.broadcast()
    return {"ok": True}


@app.post("/api/reset")
async def api_reset():
    async with session.lock:
        session.reset()
        await session.broadcast()
    return {"ok": True}


@app.post("/api/event")
async def api_event(payload: dict):
    """Inject an ActionEvent produced outside the scripted scenario.

    Two real sources use this: the hidden operator console (source="manual")
    and, in Live Hand mode, the browser-side pinch-and-drag interaction FSM
    (source="hand") - perception that never leaves the client, reporting
    only the resulting action."""
    async with session.lock:
        session.apply(
            manual_event(
                action=payload["action"],
                t=float(payload.get("t", session.state.t)),
                confidence=float(payload.get("confidence", 0.9)),
                source=payload.get("source", "manual"),
            )
        )
        await session.broadcast()
    return {"ok": True}


@app.get("/api/scenarios")
async def api_scenarios():
    return {"scenarios": list_scenarios(), "active": session.player.name}


@app.get("/api/scenario/{name}")
async def api_scenario(name: str):
    """The beats of one scenario, so Demo Replay's canvas can animate the
    same event definitions the engine is driven by rather than keeping its
    own parallel timeline (which is how they drifted apart)."""
    if name not in list_scenarios():
        return JSONResponse({"error": "unknown scenario"}, status_code=404)
    player = ScenarioPlayer(name)
    return {
        "name": player.name,
        "description": player.description,
        "events": [
            {"t": float(e["t"]), "action": e["action"]} for e in player.events
        ],
    }


@app.get("/api/log")
async def api_log():
    if not session.log or not session.log.txt_path.exists():
        return JSONResponse({"error": "no run yet"}, status_code=404)
    return FileResponse(
        session.log.txt_path, media_type="text/plain", filename=f"{session.log.run_id}-log.txt"
    )


@app.get("/api/log/text")
async def api_log_text():
    if not session.log or not session.log.txt_path.exists():
        return {"text": ""}
    return {"text": session.log.txt_path.read_text()}


# ---------- WebSocket ----------

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    session.clients.add(ws)
    await ws.send_text(json.dumps(session.snapshot()))
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "clock":
                async with session.lock:
                    changed = session.tick(float(msg.get("t", 0.0)))
                    if changed or session.speech_queue:
                        await session.broadcast()
                    else:
                        await ws.send_text(json.dumps(session.snapshot()))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        session.clients.discard(ws)


# ---------- static ----------

if MEDIA.exists():
    app.mount("/media", StaticFiles(directory=str(MEDIA)), name="media")

if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="app")
