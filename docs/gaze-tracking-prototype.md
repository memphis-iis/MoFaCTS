# Gaze tracking visual prototype

This prototype displays local WebGazer estimates; it does not record or transmit gaze samples or video. Calibration is held in memory for one lesson session. Reloading requires calibration again. Ordinary response history continues unchanged.

Add a unit with `"gazecalibrationsession": {}` before practice, then set `"gazeTracking": true` on each unit where the red dot should appear. False or omission disables the overlay and pauses inference. Calibration cannot share a unit with another session selector or adaptive transitions.

Choose Start calibration, grant camera permission, and click each blue target once, then keep looking at it for one second while five samples are collected automatically. Nine training targets are followed by five three-second validation targets. Look at the target rather than following the red dot. Continue accepts the result manually; Recalibrate restarts. Camera images and calibration are not saved. Permission denial allows Continue without tracking.

On entry to a tracked practice unit without an active calibration, including a resumed later unit, the calibration panel appears before practice begins. Continue without tracking dismisses it and starts practice. During an enabled practice unit, a small red dot follows the mean of each complete bin of five valid predictions, accepted at most once every 100 ms (a maximum 10 Hz input rate and roughly 2 Hz dot updates). A slower camera or prediction loop produces fewer updates. Invalid predictions or a 250 ms gap clear any partial bin and hide the dot. Resizing invalidates calibration. The inline Calibrate gaze action remains available after practice begins; it opens the calibration panel while practice timing continues, so the entry prompt or dedicated calibration unit is preferable for an undisturbed check.

Tracking is shared across drill, test, study, SPARC, video, and AutoTutor surfaces. It pauses on instructions, disabled units, and hidden tabs. The camera remains acquired between units; leaving the lesson or logging out releases it. Use HTTPS or localhost and a desktop webcam. Chrome and Edge are the initial manual verification targets.

## Setup and evaluation

`npm install` prepares pinned WebGazer 3.5.3 MediaPipe assets in the ignored `mofacts/public/webgazer` directory. If dependencies were installed with scripts disabled, run `node scripts/prepareWebGazerAssets.cjs` from `mofacts/`. Generated assets must be available in the application build. The tracker is GPL-3.0-or-later; its packaged MediaPipe assets retain their upstream notices.

An isolated example lives in the canonical configuration repository under `Gaze Tracking Prototype`. Load its TDF and stimulus file through the normal content workflow. It contains calibration, tracked study and drill, an untracked test, and a tracked test.

Evaluate whether the red dot is near intended viewing locations (roughly 100 pixels is the initial subjective target), how much it jitters or lags, and whether it drifts after normal typing and head movement. This is a visual feasibility check, not research validation or an automated accuracy gate.

## Extension boundary

The registered calibration engine owns its complete initialization, resume, and completion lifecycle. It does not construct the practice base engine, read lesson stimuli, or create an adaptive model. Practice engines retain their required stimulus identity checks.

The client gaze service exposes a Svelte subscription to completed five-prediction bin means, containing viewport coordinates and the last prediction's monotonic receipt timestamp, plus explicit unit activation and current practice phase. The only buffer is the current in-memory bin; it is cleared on pause, invalid prediction, and lesson change. A later recorder can subscribe without changing unit engines. No history fields, storage, server endpoints, or region classification are present in this version. Prediction receipt time is not camera capture time.
