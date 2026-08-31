"""The procedure engine.

Answers: "was that action correct at this point in the experiment?"

Pure and deterministic - no I/O, no wall clock, no framework imports. The
product's credibility rests on this module being provably correct rather
than probabilistic. See tests/test_engine.py.

Classification is a strict ordered ladder; first match wins:

  1. matches the current step                  -> correct
  2. matches a later PENDING step              -> skipped
       (intervening steps are marked skipped)
  3. matches an already-SKIPPED step           -> done_late
  4. same verb as current, different object    -> wrong_object
  5. same object as current, different verb    -> wrong_action
  6. anything else                             -> unknown
"""
from __future__ import annotations

from backend.experiment import action_name, build_steps
from backend.models import ActionEvent, Decision, RunState


def reset() -> RunState:
    return RunState(status="idle", steps=build_steps())


def start(t: float = 0.0) -> RunState:
    """Fresh run. Rebuilds steps so no state leaks between runs."""
    return RunState(
        status="running",
        current_index=0,
        steps=build_steps(),
        alert=None,
        started_at=t,
        t=t,
        events=[],
    )


def pause(state: RunState) -> RunState:
    if state.status == "running":
        state.status = "paused"
    return state


def resume(state: RunState) -> RunState:
    if state.status == "paused":
        state.status = "running"
    return state


def _split(action: str) -> tuple[str, str]:
    """VERB_OBJECT -> (VERB, OBJECT). Objects may contain underscores
    (RED_BOX), so split on the first underscore only."""
    verb, _, obj = action.partition("_")
    return verb, obj


def _classify(state: RunState, event: ActionEvent) -> Decision:
    steps = state.steps
    current = state.current_index

    # 1. exact match on the current step
    if current < len(steps):
        cur = steps[current]
        if event.action == action_name(cur.verb, cur.object):
            return Decision(kind="correct", event=event, step_id=cur.id)

    # 2. matches a later pending step -> the operator jumped ahead
    for j in range(current + 1, len(steps)):
        step = steps[j]
        if step.status == "pending" and event.action == action_name(step.verb, step.object):
            return Decision(kind="skipped", event=event, step_id=step.id)

    # 3. matches a step previously marked skipped -> late recovery
    for step in steps:
        if step.status == "skipped" and event.action == action_name(step.verb, step.object):
            return Decision(kind="done_late", event=event, step_id=step.id)

    # 4/5. compare against the current expected step
    if current < len(steps):
        cur = steps[current]
        verb, obj = _split(event.action)
        if verb == cur.verb and obj != cur.object:
            return Decision(kind="wrong_object", event=event, step_id=cur.id)
        if obj == cur.object and verb != cur.verb:
            return Decision(kind="wrong_action", event=event, step_id=cur.id)

    # 6. no relationship to the procedure
    return Decision(kind="unknown", event=event, step_id=None)


def process_event(state: RunState, event: ActionEvent) -> tuple[RunState, Decision]:
    """Apply one ActionEvent. Events have no effect unless the run is
    'running' - which is what makes pause free: the caller never has to
    buffer or discard anything."""
    if state.status != "running":
        return state, Decision(kind="unknown", event=event, step_id=None)

    decision = _classify(state, event)
    steps = state.steps

    if decision.kind == "correct":
        step = steps[state.current_index]
        step.status = "done"
        step.completed_at = event.timestamp
        state.current_index += 1
        state.alert = None

    elif decision.kind == "skipped":
        target = next(i for i, s in enumerate(steps) if s.id == decision.step_id)
        for i in range(state.current_index, target):
            steps[i].status = "skipped"
        steps[target].status = "done"
        steps[target].completed_at = event.timestamp
        state.current_index = target + 1
        state.alert = None

    elif decision.kind == "done_late":
        step = next(s for s in steps if s.id == decision.step_id)
        step.status = "done_late"
        step.completed_at = event.timestamp
        state.alert = None

    # wrong_object / wrong_action / unknown leave current_index alone.
    # The engine decides WHAT HAPPENED; guidance.py decides what to say.

    if state.current_index >= len(steps) and decision.kind in ("correct", "skipped"):
        state.status = "complete"

    return state, decision


def remaining_skipped(state: RunState) -> list:
    return [s for s in state.steps if s.status == "skipped"]
