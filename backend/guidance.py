"""The assistant layer.

Answers: "what should I tell the user now?"

Turns an engine Decision into what the operator sees and hears. All copy
lives here - the frontend renders strings, it never composes them. Errors
state what happened and what to do, in one line, without apologising.
"""
from __future__ import annotations

from backend.models import Alert, Decision, RunState

HUMAN = {
    "CONTAINER": "container",
    "RED_BOX": "red box",
    "YELLOW_BOX": "yellow box",
    "BLUE_BOX": "blue box",
}

VERB_PAST = {"OPEN": "opened", "CLOSE": "closed", "PICK": "picked up", "PLACE": "placed"}


def human_object(obj: str) -> str:
    return HUMAN.get(obj, obj.replace("_", " ").lower())


def _split(action: str) -> tuple[str, str]:
    verb, _, obj = action.partition("_")
    return verb, obj


def next_instruction(state: RunState) -> str | None:
    if state.current_index < len(state.steps):
        return state.steps[state.current_index].instruction
    return None


def build_alert(state: RunState, decision: Decision) -> Alert | None:
    """Alerts exist only for the three error kinds. Correct/skip-recovery
    clear the alert instead."""
    verb, obj = _split(decision.event.action)
    cur = state.steps[state.current_index] if state.current_index < len(state.steps) else None
    step_no = state.current_index + 1

    if decision.kind == "wrong_object" and cur:
        return Alert(
            kind="wrong_object",
            headline="Wrong object",
            detail=(
                f"That's the {human_object(obj)}. "
                f"Step {step_no} needs the {human_object(cur.object)}."
            ),
            speech=(
                f"Wrong object. That's the {human_object(obj)}. "
                f"Step {step_no} needs the {human_object(cur.object)}."
            ),
        )

    if decision.kind == "wrong_action" and cur:
        return Alert(
            kind="wrong_action",
            headline="Wrong action",
            detail=(
                f"The {human_object(obj)} was {VERB_PAST.get(verb, verb.lower())} "
                f"out of order. Step {step_no} is: {cur.instruction.lower()}."
            ),
            speech=f"Out of order. Step {step_no}: {cur.instruction}.",
        )

    if decision.kind == "unknown":
        target = f"Step {step_no}: {cur.instruction.lower()}." if cur else "Experiment complete."
        return Alert(
            kind="unknown",
            headline="Unrecognised action",
            detail=f"That action isn't part of this procedure. {target}",
            speech=f"Unrecognised action. {target}",
        )

    return None


def speech_for(state: RunState, decision: Decision) -> str:
    """What the assistant says out loud."""
    if decision.kind in ("wrong_object", "wrong_action", "unknown"):
        alert = build_alert(state, decision)
        return alert.speech if alert else ""

    if state.status == "complete":
        done = sum(1 for s in state.steps if s.status in ("done", "done_late"))
        late = sum(1 for s in state.steps if s.status == "done_late")
        tail = f" {late} step recovered." if late == 1 else (f" {late} steps recovered." if late else "")
        return f"Experiment complete. {done} steps executed.{tail}"

    nxt = next_instruction(state)

    if decision.kind == "correct":
        if nxt:
            return f"Correct. Next: {nxt.lower()}."
        # Walked past the last step without the run actually completing -
        # something earlier is still sitting skipped. Say so instead of a
        # bare "Correct." that would otherwise sound like the end.
        pending = outstanding_skipped(state)
        if pending:
            n, step = pending
            return f"Procedure incomplete. Step {n} still needs recovery: {step.instruction.lower()}."
        return "Correct."

    if decision.kind == "skipped":
        skipped = [s for s in state.steps if s.status == "skipped"]
        if skipped:
            first = skipped[0]
            n = state.steps.index(first) + 1
            return f"Step {n} was skipped. Return to step {n}: {first.instruction.lower()}."
        return f"Next: {nxt.lower()}." if nxt else ""

    if decision.kind == "done_late":
        step = next(s for s in state.steps if s.id == decision.step_id)
        n = state.steps.index(step) + 1
        return f"Step {n} recovered."

    return ""


def start_speech(state: RunState) -> str:
    nxt = next_instruction(state)
    return f"Experiment started. Step one: {nxt.lower()}." if nxt else "Experiment started."


def outstanding_skipped(state: RunState):
    """The first step still marked skipped, if any. Guidance points the
    operator back at unfinished business before anything else."""
    for i, s in enumerate(state.steps):
        if s.status == "skipped":
            return i + 1, s
    return None


def resume_speech(state: RunState) -> str:
    pending = outstanding_skipped(state)
    if pending:
        n, step = pending
        return f"Resuming. Step {n} is still outstanding: {step.instruction.lower()}."
    nxt = next_instruction(state)
    return f"Resuming. {nxt}." if nxt else "Resuming."
