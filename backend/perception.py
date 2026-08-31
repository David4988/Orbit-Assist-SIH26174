"""The perception layer - SIMULATED for this proof of concept.

Answers: "what did I observe?"

This module does NOT interpret video. It replays a scripted scenario keyed
to the demo video's playback time, and accepts manually injected events.
Both produce the identical ActionEvent shape that a real CV pipeline
(object detection + hand-object interaction + temporal action recognition)
would emit. Replacing this file is the entire migration to real ML;
nothing downstream changes.
"""
from __future__ import annotations

import json
from pathlib import Path

from backend.models import ActionEvent

SCENARIO_DIR = Path(__file__).resolve().parent.parent / "scenarios"


class ScenarioPlayer:
    """Replays scenario events as the clock advances past their timestamps.

    The clock comes from the frontend's <video> currentTime, which makes
    the demo deterministic and keeps events locked to what's on screen.
    """

    def __init__(self, name: str = "demo_master"):
        self.load(name)

    def load(self, name: str) -> None:
        path = SCENARIO_DIR / f"{name}.json"
        data = json.loads(path.read_text())
        self.name = name
        self.description = data.get("description", "")
        self.events = sorted(data["events"], key=lambda e: e["t"])
        self.fired = 0

    def reset(self) -> None:
        self.fired = 0

    def advance_to(self, t: float) -> list[ActionEvent]:
        """Return every scenario event whose time has arrived since the
        last call. Monotonic: rewinding the video does not re-fire events
        unless reset() is called."""
        out: list[ActionEvent] = []
        while self.fired < len(self.events) and self.events[self.fired]["t"] <= t:
            e = self.events[self.fired]
            out.append(
                ActionEvent(
                    action=e["action"],
                    confidence=float(e.get("confidence", 0.9)),
                    timestamp=float(e["t"]),
                    source="simulated",
                )
            )
            self.fired += 1
        return out


def manual_event(action: str, t: float, confidence: float = 0.9) -> ActionEvent:
    """Operator-triggered event, used as a live backup during Q&A."""
    return ActionEvent(action=action, confidence=confidence, timestamp=t, source="manual")


def list_scenarios() -> list[str]:
    return sorted(p.stem for p in SCENARIO_DIR.glob("*.json"))
