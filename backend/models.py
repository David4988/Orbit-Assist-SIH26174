"""Core data contracts shared across perception, engine, guidance and the API.

These are intentionally the *only* shapes that cross module boundaries. The
engine only ever sees ActionEvent in and RunState/Decision out.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

StepStatus = Literal["pending", "done", "skipped", "done_late"]
RunStatus = Literal["idle", "running", "paused", "complete"]

DecisionKind = Literal[
    "correct",
    "skipped",
    "done_late",
    "wrong_object",
    "wrong_action",
    "unknown",
]


@dataclass(frozen=True)
class ActionEvent:
    """What perception observed. This is the ONLY thing perception may emit,
    and the only thing the engine consumes. A real ML pipeline would produce
    exactly this shape.
    """

    action: str  # "VERB_OBJECT", e.g. "PICK_RED_BOX"
    confidence: float
    timestamp: float  # seconds since run start
    source: str = "simulated"  # "simulated" | "manual" | "ml" (future)


@dataclass
class StepState:
    id: str
    verb: str
    object: str
    instruction: str
    status: StepStatus = "pending"
    completed_at: Optional[float] = None


@dataclass
class Alert:
    kind: DecisionKind
    headline: str
    detail: str
    speech: str


@dataclass
class Decision:
    kind: DecisionKind
    event: ActionEvent
    step_id: Optional[str]
    alert: Optional[Alert] = None


@dataclass
class RunState:
    status: RunStatus = "idle"
    current_index: int = 0
    steps: list[StepState] = field(default_factory=list)
    alert: Optional[Alert] = None
    started_at: Optional[float] = None
    t: float = 0.0  # current clock position, seconds since start
    events: list[dict] = field(default_factory=list)  # log rows for the UI

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "current_index": self.current_index,
            "t": round(self.t, 2),
            "alert": None
            if self.alert is None
            else {
                "kind": self.alert.kind,
                "headline": self.alert.headline,
                "detail": self.alert.detail,
                "speech": self.alert.speech,
            },
            "steps": [
                {
                    "id": s.id,
                    "verb": s.verb,
                    "object": s.object,
                    "instruction": s.instruction,
                    "status": s.status,
                    "completed_at": s.completed_at,
                }
                for s in self.steps
            ],
            "events": self.events,
        }
