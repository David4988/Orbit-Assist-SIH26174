#!/usr/bin/env bash
# ORBIT ASSIST — start the demo (offline, no network required)
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating virtualenv..."
  uv venv -p 3.11 .venv
  uv pip install --python .venv/bin/python fastapi "uvicorn[standard]" pytest
fi

if [ ! -d frontend/dist ]; then
  echo "Building frontend..."
  (cd frontend && npm install && npm run build)
fi

echo "ORBIT ASSIST -> http://127.0.0.1:8000"
exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
