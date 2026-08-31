"""Six focused tests for the procedure engine.

Deliberately lightweight: the engine is the one component whose bugs would
be invisible until they were on screen in front of the panel. Everything
else is verified by running the demo.
"""
from backend import engine, guidance
from backend.models import ActionEvent

OPEN = "OPEN_CONTAINER"
PICK_R = "PICK_RED_BOX"
PLACE_R = "PLACE_RED_BOX"
PICK_Y = "PICK_YELLOW_BOX"
PLACE_Y = "PLACE_YELLOW_BOX"
CLOSE = "CLOSE_CONTAINER"
PICK_B = "PICK_BLUE_BOX"


def ev(action, t=0.0, c=0.9):
    return ActionEvent(action=action, confidence=c, timestamp=t, source="simulated")


def run(actions, state=None):
    """Feed actions into a fresh run, returning (state, decisions)."""
    state = state or engine.start(0.0)
    decisions = []
    for i, a in enumerate(actions):
        state, d = engine.process_event(state, ev(a, t=float(i)))
        decisions.append(d)
    return state, decisions


def statuses(state):
    return [s.status for s in state.steps]


def test_happy_path():
    state, decisions = run([OPEN, PICK_R, PLACE_R, PICK_Y, PLACE_Y, CLOSE])
    assert [d.kind for d in decisions] == ["correct"] * 6
    assert statuses(state) == ["done"] * 6
    assert state.status == "complete"


def test_wrong_object():
    # Blue box at step 2: flagged, the step pointer does not move, and the
    # correct action afterwards still advances normally.
    state, decisions = run([OPEN, PICK_B])
    assert decisions[1].kind == "wrong_object"
    assert state.current_index == 1
    assert state.steps[1].status == "pending"

    alert = guidance.build_alert(state, decisions[1])
    assert alert is not None and "red box" in alert.detail

    state, d = engine.process_event(state, ev(PICK_R, t=9.0))
    assert d.kind == "correct"
    assert state.current_index == 2


def test_wrong_action():
    # Re-picking the red box when it should be placed: same object, wrong verb.
    state, decisions = run([OPEN, PICK_R, PICK_R])
    assert decisions[2].kind == "wrong_action"
    assert state.current_index == 2
    assert state.steps[2].status == "pending"


def test_skipped_step_and_late_recovery():
    # Placing the yellow box before picking it up skips step 4...
    state, decisions = run([OPEN, PICK_R, PLACE_R, PLACE_Y])
    assert decisions[3].kind == "skipped"
    assert state.steps[3].status == "skipped"   # pick_yellow
    assert state.steps[4].status == "done"      # place_yellow
    assert state.current_index == 5

    # ...and performing it later repairs it. This is the demo's key beat.
    state, d = engine.process_event(state, ev(PICK_Y, t=24.0))
    assert d.kind == "done_late"
    assert state.steps[3].status == "done_late"


def test_pause_and_resume():
    state, _ = run([OPEN, PICK_R])
    assert state.current_index == 2

    state = engine.pause(state)
    assert state.status == "paused"

    # Events while paused have no effect at all.
    state, d = engine.process_event(state, ev(PLACE_R, t=15.0))
    assert state.current_index == 2
    assert state.steps[2].status == "pending"

    state = engine.resume(state)
    assert state.status == "running"
    state, d = engine.process_event(state, ev(PLACE_R, t=16.0))
    assert d.kind == "correct"
    assert state.current_index == 3


def test_completion_and_summary_speech():
    state, decisions = run([OPEN, PICK_R, PLACE_R, PLACE_Y, PICK_Y, CLOSE])
    assert state.status == "complete"
    assert state.steps[3].status == "done_late"

    # The closing announcement is built from the final step's decision.
    speech = guidance.speech_for(state, decisions[-1])
    assert "complete" in speech.lower()
    assert "recovered" in speech.lower()

    # Once complete, further events are inert.
    state, d = engine.process_event(state, ev(CLOSE, t=99.0))
    assert state.status == "complete"
