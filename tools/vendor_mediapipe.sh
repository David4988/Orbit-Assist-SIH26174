#!/usr/bin/env bash
# Vendor the MediaPipe Hand Landmarker runtime and model for fully offline use.
#
# Live Hand mode needs two things the browser fetches at startup: the WASM
# inference runtime (from the npm package) and the pretrained hand-landmark
# model bundle (a public, unauthenticated download from Google's model
# store). Both are vendored into frontend/public/ so the app never reaches
# the network once this script has run once.
set -e
cd "$(dirname "$0")/../frontend"

if [ ! -d node_modules/@mediapipe/tasks-vision ]; then
  echo "Installing @mediapipe/tasks-vision..."
  npm install @mediapipe/tasks-vision
fi

mkdir -p public/mediapipe/wasm public/models

echo "Vendoring WASM runtime..."
cp node_modules/@mediapipe/tasks-vision/wasm/*.js \
   node_modules/@mediapipe/tasks-vision/wasm/*.wasm \
   public/mediapipe/wasm/

if [ ! -f public/models/hand_landmarker.task ]; then
  echo "Downloading hand_landmarker.task (~8 MB, public, no auth)..."
  curl -sSL -o public/models/hand_landmarker.task \
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
fi

echo "Done. Verify offline with: mv public/models public/models.bak && npm run dev"
