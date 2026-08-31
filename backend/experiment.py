"""The experiment definition, as data.

PROVISIONAL: ISRO's official sample experiment text is truncated on the
public SIH portal at exactly 500 characters, ending mid-word ("...two
smaller boxes of color red and yello"). Only "outer box containing a red
and a yellow box" is confirmed. The six-step sequence below is a PoC
representation constructed for this demo, not the official sequence.
See docs/SIH26174-problem-statement.md for the verbatim source text.

Kept in one file, as data, so the real sequence can replace this one
without touching engine.py, perception.py or the frontend.
"""
from __future__ import annotations

from backend.models import StepState

EXPERIMENT_NAME = "BAS Sample Experiment — PoC Representation"

# Object vocabulary. BLUE_BOX is a deliberate distractor: it exists on the
# table but appears in no step, which is what makes "wrong object" an
# unambiguous case rather than an alias for "skipped ahead".
OBJECTS = ["CONTAINER", "RED_BOX", "YELLOW_BOX", "BLUE_BOX"]
VERBS = ["OPEN", "CLOSE", "PICK", "PLACE"]

STEP_DEFS = [
    ("open_container", "OPEN", "CONTAINER", "Open the container"),
    ("pick_red", "PICK", "RED_BOX", "Pick up the red box"),
    ("place_red", "PLACE", "RED_BOX", "Place the red box on the red marker"),
    ("pick_yellow", "PICK", "YELLOW_BOX", "Pick up the yellow box"),
    ("place_yellow", "PLACE", "YELLOW_BOX", "Place the yellow box on the yellow marker"),
    ("close_container", "CLOSE", "CONTAINER", "Close the container"),
]


def action_name(verb: str, obj: str) -> str:
    return f"{verb}_{obj}"


def build_steps() -> list[StepState]:
    """Fresh StepState list — called at the start of every run so state
    never leaks between runs."""
    return [
        StepState(id=step_id, verb=verb, object=obj, instruction=instruction)
        for step_id, verb, obj, instruction in STEP_DEFS
    ]
