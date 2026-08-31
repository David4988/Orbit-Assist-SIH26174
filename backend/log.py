"""Run logging: a human-readable text file plus a JSON sidecar.

The problem statement asks for "a timestamped and structured lightweight
text file of the conducted steps with outcomes/status". That is exactly
what log.txt is - no database involved.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

RUNS_DIR = Path(__file__).resolve().parent.parent / "runs"

OUTCOME = {
    "correct": "COMPLETED",
    "skipped": "COMPLETED (AHEAD)",
    "done_late": "RECOVERED",
    "wrong_object": "WRONG_OBJECT",
    "wrong_action": "WRONG_ACTION",
    "unknown": "UNRECOGNISED",
}


class RunLog:
    def __init__(self, run_id: str | None = None):
        self.run_id = run_id or datetime.now().strftime("%Y%m%d-%H%M%S")
        self.dir = RUNS_DIR / self.run_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.rows: list[dict] = []
        self.started = datetime.now()
        self._write_header()

    @property
    def txt_path(self) -> Path:
        return self.dir / "log.txt"

    @property
    def json_path(self) -> Path:
        return self.dir / "log.json"

    def _write_header(self) -> None:
        self.txt_path.write_text(
            "ORBIT ASSIST - EXPERIMENT LOG\n"
            "BAS Sample Experiment - PoC Representation\n"
            f"Run ID    : {self.run_id}\n"
            f"Started   : {self.started.strftime('%Y-%m-%d %H:%M:%S')}\n"
            "Perception: SIMULATED (scripted scenario; not a trained model)\n"
            + "-" * 64
            + "\n"
        )

    def append(self, *, t: float, step_no: int | None, action: str,
               kind: str, confidence: float, source: str) -> dict:
        clock = (self.started + timedelta(seconds=t)).strftime("%H:%M:%S")
        outcome = OUTCOME.get(kind, kind.upper())
        step_label = f"STEP {step_no}" if step_no else "  -   "
        line = f"{clock}  {step_label:<8}  {action:<20}  {outcome}"
        with self.txt_path.open("a") as f:
            f.write(line + "\n")

        row = {
            "clock": clock,
            "t": round(t, 2),
            "step": step_no,
            "action": action,
            "outcome": outcome,
            "kind": kind,
            "confidence": round(confidence, 2),
            "source": source,
        }
        self.rows.append(row)
        self.json_path.write_text(json.dumps({"run_id": self.run_id, "events": self.rows}, indent=2))
        return row

    def finalise(self, state) -> None:
        done = sum(1 for s in state.steps if s.status in ("done", "done_late"))
        late = sum(1 for s in state.steps if s.status == "done_late")
        skipped = sum(1 for s in state.steps if s.status == "skipped")
        errors = sum(1 for r in self.rows if r["kind"] in ("wrong_object", "wrong_action", "unknown"))
        status = "COMPLETE" if state.status == "complete" else "INCOMPLETE"
        with self.txt_path.open("a") as f:
            f.write("-" * 64 + "\n")
            f.write(f"Status          : {status}\n")
            f.write(f"Steps executed  : {done} of {len(state.steps)}\n")
            f.write(f"Errors corrected: {errors}\n")
            f.write(f"Steps recovered : {late}\n")
            f.write(f"Steps skipped   : {skipped}\n")
            f.write(f"Duration        : {state.t:.1f}s\n")
