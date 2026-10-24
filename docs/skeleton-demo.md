# Live skeleton demo unit

Add this unit to a TDF's `tutor.unit` array:

```json
{
  "unitname": "Live skeleton demo",
  "skeletondemosession": {}
}
```

The registered `skeleton-demo` engine owns its lifecycle without constructing the
practice engine or reading practice stimuli. It cannot share a unit with another
session selector, adaptive transitions, or enabled gaze tracking. Other units in
the lesson retain their existing behavior. The canonical configuration repository
contains `Skeleton Demo/` and the upload archive `Skeleton_Demo.zip`, with exactly
one demo unit and a stimulus file containing `"clusters": []`.

## Learner experience and data

Choose Start camera and grant camera permission. The live preview shows
visible body, hand, and finger landmarks and connecting lines; keep the head, shoulders, arms, and hands
in view. Start camera opens the browser's default/preferred camera without
requiring front/rear metadata from desktop webcams. After camera permission,
Switch camera appears only while capture is active and the browser exposes
multiple cameras including the active camera's identity. It cycles through
those cameras by device ID, releasing the old stream before opening the next.
The front/webcam view is mirrored; a camera reporting rear-facing is not.
An unavailable selected camera produces an explicit error. Start camera then
explicitly reopens the default camera; no automatic substitute is requested.
The compact toolbar sits above the preview with a brief instruction and status.
The application shell supplies the lesson heading, avoiding a repeated title.
The shell-loaded `public/styles/classic.css` owns the preview geometry and
theme-based spacing on both desktop and mobile. The preview fills the remaining
lesson viewport, proportionally shrinking the full video and both overlays to
fit its available width and height. The layout has no page or nested scrollbar.
Stop camera releases the stream. Continue releases it and uses normal
unit progression. Leaving the unit, hiding the tab, or leaving the page also
stops the stream and inference. Returning requires Start camera again.

No camera image, pose sample, score, trial history, recording, or local-storage
record is saved or uploaded. Only the current pose is held in browser memory for
display. Continue retains the existing lesson-position/completion persistence.
The unit does not mount the scored content runtime. No new server methods,
database fields, or data migration are needed. The demo's labels are English.

## Reusable components

- `cameraCapture.ts`: owns one permission request/stream and releases late grants
  after cancellation; requests video only and releases the old stream before
  requesting an explicitly selected device ID. Camera identities stay in memory
  only for the current capture; they are not logged or persisted.
- `poseTracking.ts`: owns one pose model and one two-hand model with a single
  bounded frame loop. Both process the same video frame and timestamp.
  Publishes the current normalized body/hand landmarks, dimensions, and monotonic inference
  timestamp to its consumer. No history buffer or global sample store exists.
- `PoseCameraPreview.svelte`: renders video and visible landmarks together with
  identical sizing and mirroring. The central theme owns appearance.
- `SkeletonDemoUnit.svelte`: owns the registered unit's camera controls,
  initialization, status, teardown and completion.

The Full Pose model estimates one person's 33 body landmarks. The Hand Landmarker
adds 21 landmarks per hand for up to two hands, including all five fingers.
Hand landmarks use the hand detector's confidence thresholds, rather than the
pose model's per-landmark visibility field. Depth is inferred, not a calibrated room
measurement. CPU inference is capped at 15 Hz and skips duplicate video frames;
actual speed depends on the learner's device.

## Runtime assets and setup

The dependency is pinned to `@mediapipe/tasks-vision` 0.10.35. Normal application
`npm ci` runs `scripts/prepareMediaPipeAssets.cjs` in postinstall, copying the
dependency's WASM to ignored `public/mediapipe/wasm/`. If scripts were disabled,
run that script explicitly before starting/building the app. No CDN is required.
The source-owned Full Pose float16 version 1 model is served at
`/mediapipe/pose_landmarker_full.task`. The source-owned Hand Landmarker float16
version 1 model is served at `/mediapipe/hand_landmarker.task`. Preparation verifies
both SHA-256 checksums; both use the existing pinned Tasks Vision runtime.
Apache-2.0 notices and provenance are in `public/mediapipe/`. A missing runtime
or model is an error; no substitute tracker or CDN recovery path is used.

Use HTTPS or localhost and a browser with camera access and WebAssembly support.
The existing self-hosted CSP example already allows same-origin WASM with
`wasm-unsafe-eval`; this change adds no third-party origins or CSP relaxations.

## Verification

From `mofacts/`, run `npm run typecheck`, `npm run lint`, and, after registry
changes, `npm run generate:schemas`. Focused checks:

```text
node --test scripts/skeletonDemo.test.cjs scripts/gazeTracking.test.cjs
node --test scripts/skeletonDemoBrowser.test.cjs
```

The browser check uses the production content-route wrapper, Svelte demo,
camera/tracking code, the app shell's actual stylesheet links and lesson
container, and real local MediaPipe inference on synthetic video. It checks a
camera lifecycle and two-camera switching, and loads both real inference models.
App persistence/session services and adjacent practice/gaze displays are
isolated test boundaries. It checks no-person behavior, stop/restart, front/rear
switching and unavailable-camera errors, mobile control visibility and preview
proportions and absence of page/nested scrolling at desktop, portrait, and
landscape sizes, transitions
between demo units and back to the practice surface, permission failure, and
absence of third-party requests. It requires the canonical
localhost watcher. A person must still inspect tracking alignment and responsiveness
with a physical camera; automated lifecycle checks do not establish that quality.
