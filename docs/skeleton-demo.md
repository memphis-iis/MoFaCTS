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
hand and finger landmarks and connecting lines, without the full-body wireframe.
Keep the fingertips used by the current gesture in view. A left-hand palette offers Cube and Pyramid as miniature labeled 3D
wireframes, using the same exact geometry, projection, hidden edges, midpoint
equality ticks, and AB annotation as the main display. Initially no figure is active. Place the midpoint of your thumb and index fingertips anywhere inside a figure
button. The compact buttons use half-spacing padding and translucent theme-colored
backgrounds so the camera remains visible behind fully opaque icons and labels.
Whenever those fingertips are pinched, that button selects immediately.
No prior opening or closing motion is required. Keep the pinch held while moving
between buttons to switch figures. Middle-finger position does not block selection;
a three-finger pinch over a button also selects it. Tracking reacquisition accepts
an already pinched hand immediately. Selection preserves each figure's size and rotation.
The hand wireframe draws
above the icons, while the camera image stays behind them. Buttons also support
click, touch, and keyboard activation. The palette consumes gestures without
rotating or resizing the figure.

The selected figure appears on the right as an exact labeled wireframe. Visible
edges are solid; hidden edges and their equality ticks are dashed/faded at 30%
opacity (ticks remain short solid strokes). All edges carry a single midpoint
tick, and AB displays the current length. No XYZ axes appear. The cube has
vertices A-H; the square pyramid has A-D around the base and E at the apex.
Vertex letters and the AB annotation have fixed anchors in the solid's 3D
coordinates and rotate/scale with it. Text remains upright and screen-sized.
There is no per-frame collision rearrangement or independent label clamping;
labels can overlap when their 3D anchors line up in the camera view.
All edges initially measure 1 unit. The pyramid's height is 1/sqrt(2), with the
solid centroid one-quarter of that height above the base. Both figures rotate
and scale about their volume centroid, with a fixed orthographic view. Each
remembers its own orientation and length when switching within this unit.

Away from the palette, turn your palm to rotate. The figure follows the full
orientation of the palm plane with temporal smoothing; no finger pose is required.
Bring all three tips together and move upward to grow
the figure or downward to shrink it. This changes all edge lengths and the AB
label, within 0.25-4 units. One-quarter of the preview height doubles/halves size.
Each new gesture establishes a fresh reference, without requiring stillness.
Slow movements apply; fast movements are ignored. The next slower increment
resumes immediately without replaying ignored motion. A second hand remains
visible without taking over rotation/resizing while the controlling hand is
identifiable. Either valid hand can select a palette figure, even while the
other controls rotation/resizing. An accepted selection transfers ownership and
establishes a fresh movement reference. The existing status area explains
selection blockers: missing/uncertain tracking, the pinch midpoint outside a
button, or thumb and index too far apart.

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
the controlling hand, its timestamp, and each figure's
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
  Publishes current normalized hand landmarks, aligned hand-world landmarks
  and confident handedness labels, dimensions, and monotonic inference
  timestamp to its consumer. No history buffer or global sample store exists.
- `PoseCameraPreview.svelte`: renders video and visible landmarks together with
  identical sizing and mirroring. The central theme owns appearance.
- `SkeletonDemoUnit.svelte`: owns the registered unit's camera controls,
  initialization, status, teardown and completion.
- `learning-components/units/skeleton-demo/figureGestures.ts`: one pure classifier
  for palette selection, smoothed palm-plane rotation, triple-pinch resizing, and
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

Rotation uses the wrist and index/little-finger base landmarks (0, 5, 17) in
estimated 3D world coordinates. These define a palm plane and an in-plane axis,
independent of fingertip positions, finger extension, or fingertip overlap.
A palm triangle area ratio below 0.08 disables rotation; a normalized side-proportion
change above 0.12 rejects that movement. The full relative orientation includes
tilt and twist. Forward/backward wrist tilt is reversed about the camera-horizontal
axis; side-to-side turning and clockwise/counterclockwise rotation keep their
existing directions. This mapping is applied after smoothing in both mirrored
and unmirrored views. A One Euro-style adaptive spherical orientation filter uses a 225 ms resting
time constant and reduces it toward 100 ms during deliberate turns. Signed 3D angular
velocity is low-pass filtered at 1 Hz before its magnitude sets the orientation
cutoff (base 0.707 Hz plus 1 Hz per rad/s, capped at 1.592 Hz). Filtering the velocity
vector lets alternating jitter cancel instead of automatically accelerating the filter.
Both filters use elapsed-time exponential integration; orientation follows the shortest
3D rotation without Euler-angle averaging or a dead zone. This is an SO(3) adaptation
of the [One Euro filter](https://gery.casiez.net/publications/CHI2012-casiez.pdf), with a
bounded cutoff. It does not predict motion or interpolate display frames between observations.
Resizing requires the three fingertips together and takes priority over palm rotation.
Outside the palette, triple pinch takes priority over rotation. Ambiguous directions, tracking gaps over 250 ms,
mode/owner changes, and rejected motion establish a fresh smoothing reference and clear the angular-velocity estimate.
Angular speed above 720 degrees/s, translation above 6 palm widths/s, or apparent
size change above 4.5/s is ignored without replaying that movement.
Selection accepts a thumb-index gap up to 80% of estimated 3D palm width,
independently of prior frames or middle-finger spacing. Triple pinch activates
resizing immediately at 80% and remains active up to 95% to avoid mode jitter.
Its first observation establishes the position from which up/down movement changes size;
there is no arming step, opening requirement, or dwell timer. Palm width is measured between index
and little-finger bases in 3D, so ratios do not directly use foreshortened 2D
camera distances. For a 60 mm palm, both selection and resizing accept gaps up to 48 mm (all three pairs for resizing).
Fingertips do not need to touch or press together. These are model estimates requiring physical testing.
Finite palm landmarks may lie outside the preview when reaching toward an edge;
only the fingertips used by the current gesture must remain in view. Stop/switch/hide and tracking gaps clear motion references.
Distances are MediaPipe estimates, not calibrated physical measurements.

Screen translation uses the palm center and largest projected wrist/knuckle span.
This avoids rejecting the palm solely because its knuckle row is viewed edge-on. Absolute log palm-size change
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
feeds the real Svelte classifier/display path: camera pinch selects both figures, including selection by the second hand while
the first retains control. It verifies both annotated palette miniatures.
Tilt changes projected geometry, fast rotation leaves it unchanged, the next slow
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
mirroring and target bounds, immediate held-pinch selection, selection across hand ownership,
selection-blocking hints, hand continuity and invalid data.
The browser fixture requires the canonical
localhost watcher. A person must still inspect tracking alignment and responsiveness
with a physical camera; automated lifecycle checks do not establish that quality.
Try repeated slow/fast/slow strokes with both hands, lowering the hand, bending
the fingers, and moving toward the camera. Check that the figure remains still
during fast movements and resumes immediately on slower motion without a jump.
No physical result is implied
by a synthetic test passing.
Also physically try both palette icons with thumb-index pinch, palm tilt and twist,
the palm rotation, and triple-pinch up/down resizing. Check
comfortable targeting and that switching figures restores their individual state.


### Partial hand visibility

Validation is specific to each gesture: button selection requires thumb and index
tips; resizing requires thumb, index, and middle tips. Palm rotation needs no
fingertips, only usable wrist and index/little-knuckle estimates. Missing, invalid,
or off-screen fingertips do not block palm rotation. Missing middle fingertips
do not block button selection. Pinches require their own fingertips in view.
Palm estimates and confident hand identity remain necessary for scale and motion
continuity; the tracker must still detect a hand. Missing points are not fabricated.
Losing a required point stops that gesture; reacquiring it establishes a fresh
motion reference, so rotation or resizing does not jump. Button selection remains
immediate. Synthetic tests cover missing/invalid points and all four frame edges;
physical camera reliability still requires testing with the actual device.


The **Wireframe** toggle shows or hides only hand landmark dots and connections.
Body landmarks are not rendered. Camera visibility, figure visibility, and gesture
controls keep their existing behavior. This display change does not change the
tracking service's model loading or inference contract.
