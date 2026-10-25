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
in view. A shaded, outlined cube and labeled XYZ axes overlay the full camera
preview. The axes and cube rotate together about the axes' origin. The cube's
position and orientation relative to those axes stay fixed throughout rotation;
the camera fits the complete swept volume. Spread the thumb, index fingertip, and middle fingertip
and turn your hand. The first valid hand controls the cube;
the second hand remains visible without taking over while that hand is tracked.
Movements below the speed cutoffs rotate it; faster movements are ignored.
The next below-cutoff movement applies immediately, without holding still or
replaying the ignored motion. Reversals follow the same speed rule. Tilting
the finger plane changes the axis, but tilt alone does not spin the cube.

Start camera opens the browser's default/preferred camera without
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
record is saved or uploaded. The current pose, one previous gesture sample for
the controlling hand, its timestamp, and the cube's orientation are held only in
browser memory. Stop/switch/hide clears gesture acquisition; the displayed cube
keeps its orientation until the unit unmounts. Continue retains the existing lesson-position/completion persistence.
The unit does not mount the scored content runtime. No new server methods,
database fields, or data migration are needed. The demo's labels are English.

## Reusable components

- `cameraCapture.ts`: owns one permission request/stream and releases late grants
  after cancellation; requests video only and releases the old stream before
  requesting an explicitly selected device ID. Camera identities stay in memory
  only for the current capture; they are not logged or persisted.
- `poseTracking.ts`: owns one pose model and one two-hand model with a single
  bounded frame loop. Both process the same video frame and timestamp.
  Publishes current normalized body/hand landmarks, aligned hand-world landmarks
  and confident handedness labels, dimensions, and monotonic inference
  timestamp to its consumer. No history buffer or global sample store exists.
- `PoseCameraPreview.svelte`: renders video and visible landmarks together with
  identical sizing and mirroring. The central theme owns appearance.
- `SkeletonDemoUnit.svelte`: owns the registered unit's camera controls,
  initialization, status, teardown and completion.
- `learning-components/units/skeleton-demo/handRotation.ts`: owns pure gesture
  interpretation and waiting/controlling/ignored observations through explicit frame
  inputs and incremental axis/angle outputs. No renderer or Meteor dependency.
- `HandCubeOverlay.svelte` and `handCubeScene.ts`: own lazy Three.js loading,
  quaternion rotation, responsive rendering, theme colors, and resource disposal.
  Render on observations, resize, and theme changes; no auto-spin or inertia.

The Full Pose model estimates one person's 33 body landmarks. The Hand Landmarker
adds 21 landmarks per hand for up to two hands, including all five fingers.
Hand landmarks use the hand detector's confidence thresholds, rather than the
pose model's per-landmark visibility field. Depth is inferred, not a calibrated room
measurement. CPU inference is capped at 15 Hz and skips duplicate video frames;
actual speed depends on the learner's device.

## Gesture limits and coordinate contract

The plane uses estimated 3D fingertips 4, 8, and 12. Successive planes are aligned
before measuring twist, so tilt does not introduce rotation. Mirroring is applied
to gesture coordinates, not the text/cube canvas; camera-space axes are mapped
into the 3D view. Rotation gain is 1:1. Hand identity uses handedness and image
position, never detection-array order. Ambiguous/missing identity, invalid or
out-of-frame landmarks, narrow triangles, and gaps over 250 ms require a fresh
reference. The first valid observation establishes that reference; the next
valid movement is evaluated immediately. There is no settling timer.

`HAND_ROTATION_LIMITS` holds prototype defaults: angular/tilt speed above
720 degrees/s or translation above 6 palm widths/s causes that movement to be
ignored. Every valid observation advances the reference, including ignored fast
movement, so slowing down resumes control on the next observation. Direction
changes have no separate acceleration threshold. Shape checks use
normalized edge proportions (maximum change 0.12), and the
triangle area ratio must be at least 0.08. Handedness confidence must be at least 0.7.

Screen translation uses the palm center and width. Absolute log palm-size change
per second is a coarse depth-motion signal (ignore above 4.5).
Hand-world coordinates are hand-centered and are never treated as absolute
room position. These thresholds need physical-camera tuning; they are not
validated movement measurements. Tracking/finger deformation can still affect
the interaction. Every rejected observation leaves the cube unchanged.

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

Three.js is pinned to 0.186.1 with development typings 0.186.0. It is loaded only
when the demo overlay mounts. Its MIT notice is distributed at
`/licenses/three-LICENSE.txt`. WebGL2 initialization/context failure stops gesture
control with an explicit error; reload after fixing browser graphics support.

Use HTTPS or localhost and a browser with camera access, WebAssembly, and WebGL2 support.
The existing self-hosted CSP example already allows same-origin WASM with
`wasm-unsafe-eval`; this change adds no third-party origins or CSP relaxations.

## Verification

From `mofacts/`, run `npm run typecheck`, `npm run lint`, and, after registry
changes, `npm run generate:schemas`. Focused checks:

```text
node --test scripts/handRotation.test.cjs scripts/handCubeScene.test.cjs scripts/skeletonDemo.test.cjs scripts/gazeTracking.test.cjs
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
absence of third-party requests. It also checks the real cube canvas and axis
label layout, unmirrored labels, and camera shutdown on graphics-context loss.
An additional synthetic-hand fixture feeds the real Svelte controller/rendering
path and compares cube pixels during slow movement, ignored fast movement, and
the very next slow observation, with no stationary samples;
it also checks hidden-tab shutdown and unsupported WebGL initialization.
Scene-matrix tests verify the cube's fixed position/orientation relative to the
rotating axes, axis-label attachment, and framing through varied rotations and
portrait/landscape aspect ratios. Gesture tests include faster accepted motion.
The pure controller tests cover signed turning, tilt, translation, abrupt/slow
reversal, immediate resumption, hand identity, mirroring, depth-size changes and invalid data.
The browser fixture requires the canonical
localhost watcher. A person must still inspect tracking alignment and responsiveness
with a physical camera; automated lifecycle checks do not establish that quality.
Try repeated slow/fast/slow strokes with both hands, lowering the hand, bending
the fingers, and moving toward the camera. Check that the cube remains still
during fast movements and resumes immediately on slower motion without a jump.
No physical result is implied
by a synthetic test passing.
