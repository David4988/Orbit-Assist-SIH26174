# SIH26174 — AI Human Activity Recognition for On-board BAS Experiments

**Source:** https://www.sih.gov.in/sih2026PS (modal `#ViewProblemStatement26174`), fetched 2026-08-31.
**Organisation:** Indian Space Research Organisation (ISRO)
**Department:** Department of Space / Indian Space Research Organisation
**Category:** Software · **Theme:** Space Technology
**Deadline (per portal):** 20 September 2026

> Text below is transcribed verbatim from the official portal. Do not paraphrase it into the design docs — quote it.

## Background

As humanity aims for space missions such as BAS and lunar missions, real-time ground support becomes
impossible due to communication delays. An AI-based HAR system acts as an on-board assistant that supports
the execution of scientific experiments, ensuring the success of science beyond Earth's orbit.

In the space environment, AI-based HAR system may act as mission-critical support for astronauts. By tracking
astronaut movements and activities in real time, HAR ensures scientific experiments and related protocols are
executed flawlessly without requiring constant, high-bandwidth communication with mission control.

## Description

Challenge is to design and train an AI model that recognizes and validates the sequence of a pre-defined
experiment using human activity recognition techniques.

Standalone operation: Space stations operate on restricted data bandwidth to Earth. Rather than streaming raw
video to ground control, data is processed locally at the 'edge.' Inputs are given from fixed-payload cameras.

Dataset generation to train model for object detection, pose estimation and hand-object interaction based on
the steps of the experiment.

Optional: Another challenge is that Standard 2D or ground-based 3D posture models fail because astronauts do
not have a fixed 'up' or 'down' orientation. The AI model should use orientation-agnostic 3D Human Mesh
Recovery (HMR) to track the astronaut's body relative to the payload rack, not the floor.

## Expected Solution

* The software should continuously process local video feeds to track the sequence of experiment.
* At the start or after each step, the model should suggest the next step to be performed.
* It should alert when a step is skipped or an out of sequence step is added. It should be a voice based alert.
* Using the live video, it should generate a timestamped and structured lightweight text file of the conducted
  steps with outcomes/ status.
* Stream the video of the experiment to specific IP and also store the video locally.
* A graphical user interface for monitoring the above activities.
* Deliverable: A trained AI model that runs on offline standalone system

## Dataset field (TRUNCATED BY THE PORTAL)

The portal stores this field capped at 500 characters. The published text ends mid-word. Verbatim:

> This problem requires synthetic dataset generation. Teams have to build a custom, highly focused local
> dataset (even just using a webcam) replicating a specific experiment. For this particular problem, following
> is the sequence of steps in a sample experiment:
> Sample Experiment
> You are given a box that contains two smaller boxes of color red and yello

**The sample experiment's step sequence is NOT publicly available.** It is cut off at exactly 500 chars
(`...red and yello`). Verified: the string appears 6× in the page source, always truncated identically; there
is no dataset href and no YouTube link for this PS.

### What is therefore CONFIRMED about the sample experiment
1. There is an outer/containing box.
2. It contains two smaller boxes.
3. Those two boxes are coloured **red** and **yellow**.

Everything past that is unknown. See `docs/PLAN.md` §4 for how this dependency is isolated.

### How to resolve
1. Ask on the SIH portal / ISRO PS clarification channel for the full sample experiment text.
2. Check the SIH student dashboard after team registration — the full field is sometimes visible there.
3. Contact the ISRO SPOC listed under the PS.
