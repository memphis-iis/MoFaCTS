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
in view. A left-hand palette offers Cube (square icon) and Pyramid (triangle
icon). Initially no figure is active. Position your camera-tracked thumb and
index finger over an icon and pinch them together, keeping the middle finger
apart. Both fingertips must land inside that button. Opening anywhere in the
preview arms selection; closing just before reaching the button does not discard
it. An accepted selection consumes the pinch; open again before another
selection. Holding it does not repeatedly select. The body/hand wireframe draws
above the icons, while the camera image stays behind them. Buttons also support
click, touch, and keyboard activation. The palette consumes gestures without
rotating or resizing the figure.

The selected figure appears on the right as an exact labeled wireframe. Visible
edges are solid; hidden edges and their equality ticks are dashed/faded at 30%
opacity (ticks remain short solid strokes). All edges carry a single midpoint
tick, and AB displays the current length. No XYZ axes appear. The cube has
vertices A-H; the square pyramid has A-D around the base and E at the apex.
All edges initially measure 1 unit. The pyramid's height is 1/sqrt(2), with the
solid centroid one-quarter of that height above the base. Both figures rotate
and scale about their volume centroid, with a fixed orthographic view. Each
remembers its own orientation and length when switching within this unit.

Away from the palette, spread the thumb, index, and middle fingertips about an
inch apart to rotate. The figure follows the triangle's full orientation: tilt
and twist both rotate it. Bring all three tips together and move upward to grow
the figure or downward to shrink it. This changes all edge lengths and the AB
label, within 0.25-4 units. One-quarter of the preview height doubles/halves size.
Each new gesture establishes a fresh reference, without requiring stillness.
Slow movements apply; fast movements are ignored. The next slower increment
resumes immediately without replaying ignored motion. A second hand remains
visible without taking over while the controlling hand is identifiable.

The controls, demonstration canvas, and palette use the application's shared
`card` styles. Surface colors, text, borders, rounding, buttons, and figure
annotations follow the active application theme. The compact controls keep the
demonstration canvas usable on portrait and short landscape screens.

**Camera** and **Wireframe** are independent visibility buttons, both initially
On. Camera controls the live video; Wireframe controls the tracked body/hand
lines and landmark dots. The selected geometric figure and palette stay visible.
All four combinations are supported. Hiding a layer preserves its layout and
does not stop capture or inference, so gesture rotation/resizing still work
with both layers hidden. Use **Stop camera** to release the camera. Visibility
choices remain through stop/start and camera switching within the mounted unit,
and reset to On when entering a new demo unit. Buttons expose pressed state and
support keyboard activation.

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
the controlling hand, its timestamp, pinch recognition, and each figure's
orientation/edge length are held only in browser memory. Stop/switch/hide clears
gesture acquisition; figure state remains until the unit unmounts. Continue
retains the existing lesson-position/completion persistence.
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
- `learning-components/units/skeleton-demo/figureGestures.ts`: one pure classifier
  for palette selection, full-orientation rotation, triple-pinch resizing, and
  inactive movement. Explicit frame/context input includes actual palette bounds
  and the active figure; output supplies selection, axis/angle, or size factor.
- `figureGeometry.ts` in the same directory: unit-edge cube and square-pyramid
  coordinates, edges and face adjacency, centered on the solid-volume centroid.
- `FigureOverlay.svelte` and `figureScene.ts`: own lazy Three.js math loading,
  per-figure quaternion/length state, orthographic projection and SVG display.
  The app measures DOM bounds and maps mirrored video coordinates into them.
  Theme-owned SVG draws actual projected edges, midpoint ticks and vertex/length
  labels at readable screen sizes. There is one vector renderer, with no shaded
  mesh, separate cube path, GPU context, auto-spin, or inertia.

The Full Pose model estimates one person's 33 body landmarks. The Hand Landmarker
adds 21 landmarks per hand for up to two hands, including all five fingers.
Hand landmarks use the hand detector's confidence thresholds, rather than the
pose model's per-landmark visibility field. Depth is inferred, not a calibrated room
measurement. CPU inference is capped at 15 Hz and skips duplicate video frames;
actual speed depends on the learner's device.

## Gesture limits and coordinate contract

The plane uses estimated 3D fingertips 4, 8, and 12. An ordered orthonormal basis
describes each triangle; currentBasis * previousBasis^T supplies the full
relative rotation. Mirroring is applied to gesture coordinates, not the text;
camera-space rotation is mapped into the 3D view. Gain is 1:1. Hand identity uses handedness and image
position, never detection-array order. Ambiguous/missing identity, invalid or
out-of-frame landmarks, narrow triangles, and gaps over 250 ms require a fresh
reference. The first valid observation establishes that reference; the next
valid movement is evaluated immediately. There is no settling timer.

`FIGURE_GESTURE_LIMITS` holds prototype defaults: full angular speed above
720 degrees/s or translation above 6 palm widths/s causes that movement to be
ignored. Every valid observation advances the reference, including ignored fast
movement, so slowing down resumes control on the next observation. Direction
changes have no separate acceleration threshold. Shape checks use
normalized edge proportions (maximum change 0.12), and the
triangle area ratio must be at least 0.08. Handedness confidence must be at least 0.7.
Rotation enters when all pairwise distances reach 25.4 mm and exits when any
falls below 20 mm. Triple pinch enters when all distances are at most 12 mm,
exiting when any exceeds 18 mm. It takes priority over two-finger selection.
A selecting thumb-index pinch closes at 12 mm; reopening to 20 mm enables a
new selection. The middle finger must remain at least 25.4 mm from both tips.
Distances are MediaPipe estimates, not calibrated physical measurements.

Screen translation uses the palm center and width. Absolute log palm-size change
per second is a coarse depth-motion signal (ignore above 4.5).
Hand-world coordinates are hand-centered and are never treated as absolute
room position. These thresholds need physical-camera tuning; they are not
validated movement measurements. Tracking/finger deformation can still affect
the interaction. Every rejected observation leaves the active figure unchanged.
Mode/owner changes, preview resizing, mirroring changes and figure selection
establish fresh references. Size-limit clamping still advances the hand
reference, so reversing direction responds immediately.

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
`/licenses/three-LICENSE.txt`. A failed display-module load or projection stops
the camera with an explicit error; reload to retry. The vector renderer uses
SVG and Three.js math, so no WebGL context is required.

Use HTTPS or localhost and a browser with camera access, WebAssembly, and SVG support.
The existing self-hosted CSP example already allows same-origin WASM with
`wasm-unsafe-eval`; this change adds no third-party origins or CSP relaxations.

## Verification

From `mofacts/`, run `npm run typecheck`, `npm run lint`, and, after registry
changes, `npm run generate:schemas`. Focused checks:

```text
node --test scripts/figureGestures.test.cjs scripts/figureScene.test.cjs scripts/skeletonDemo.test.cjs scripts/gazeTracking.test.cjs
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
absence of third-party requests. It checks palette/label layout and unmirrored
text at desktop and narrow portrait/landscape sizes. A synthetic-hand fixture
feeds the real Svelte classifier/display path: camera pinch selects both figures,
tilt changes projected geometry, fast rotation leaves it unchanged, the next slow
rotation resumes, triple pinch resizes, and reversing at a size limit responds
immediately. It verifies retained figure state, keyboard selection, hidden-tab
shutdown, unmounting, and explicit display-module failure.
It exercises all four camera/wireframe visibility combinations, checking that
video tracks remain live and synthetic gesture rotation continues. It also
verifies card surfaces/radii and figure accent colors against the actual Default
and Dark Industrial theme properties.
Geometry tests verify all unit edges, tetrahedral-volume centroids, hidden edges,
ticks, fixed orthographic scaling, size clamping and framing at varied rotations.
Pure gesture tests cover thresholds/hysteresis, mutually exclusive modes,
mirroring and target bounds, pinch latching, hand continuity and invalid data.
The browser fixture requires the canonical
localhost watcher. A person must still inspect tracking alignment and responsiveness
with a physical camera; automated lifecycle checks do not establish that quality.
Try repeated slow/fast/slow strokes with both hands, lowering the hand, bending
the fingers, and moving toward the camera. Check that the figure remains still
during fast movements and resumes immediately on slower motion without a jump.
No physical result is implied
by a synthetic test passing.
Also physically try both palette icons with thumb-index pinch, full-plane tilt,
the approximate-inch spread gesture, and triple-pinch up/down resizing. Check
comfortable targeting and that switching figures restores their individual state.
