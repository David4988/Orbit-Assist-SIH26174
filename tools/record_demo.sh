#!/usr/bin/env bash
# Record the experiment feed for the demo.
#
# Shoot one continuous take of the six steps, performing the errors on cue.
# Timings must match scenarios/demo_master.json:
#
#     t=04s   open the container
#     t=14s   pick up the BLUE box      <- deliberate wrong object
#     t=24s   pick up the red box       <- recovery
#     t=34s   place the red box on the red marker
#     t=46s   place the yellow box      <- skips "pick yellow"
#     t=58s   pick up the yellow box    <- repairs the skipped step
#     t=72s   close the container
#
# Then trim/retime demo_master.json against the finished take if needed.
set -e
cd "$(dirname "$0")/.."

DEVICE="${1:-0}"      # `ffmpeg -f avfoundation -list_devices true -i ""` to list
DURATION="${2:-85}"

echo "Recording ${DURATION}s from video device ${DEVICE}..."
echo "Countdown: 3..2..1"; sleep 3

ffmpeg -y -f avfoundation -framerate 30 -video_size 1280x720 -i "${DEVICE}:none" \
  -t "${DURATION}" -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p \
  media/experiment.mp4

echo "Saved to media/experiment.mp4"
