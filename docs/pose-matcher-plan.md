# Calibrated 3D pose comparison experiment

This experiment is built into the existing **Live skeleton demo** unit, in the
expandable **3D pose matcher comparison** panel. Existing hand selection,
rotation, and resizing remain active. They are geometric gesture rules, not a
preexisting template matcher. The panel introduces two identifiable distance
methods evaluated on exactly the same current body-world observation.
The panel overlays the preview's lower corner. Its expanded content scrolls within
a quarter of the viewport height, preserving the preview layout on small screens.

## Method

Use MediaPipe Pose world landmarks 11–16: left/right shoulders, elbows, wrists.
Image coordinates remain for display and existing gestures only. The tree roots
at the left shoulder, connects the shoulder span, then follows each shoulder to
elbow to wrist. The shoulder span is a torso connection, not a literal bone.
This bounded upper-body subset avoids stitching hand-centered world coordinates
to the pose model's separately estimated world coordinates. Fingers and lower
body are outside this first test. Closed skeletal loops are not independently
constrained; expanding the subset requires an explicit topology choice.

Capture a valid reference pose to obtain target segment lengths and all 15
corresponding labeled pair distances. Separately collect 45 valid, timestamp-unique
personal calibration frames while moving both arms (about three seconds at the
15 Hz inference cap, longer with tracking gaps). All six landmarks must have
finite XYZ, visibility at least 0.5, and noncollapsed connected segments. Use the
median length of each segment as that person's baseline. Calibration uses no
template scores or requirement to hold the reference pose.

For each current tree displacement, multiply by target segment length divided by
personal baseline length. Rebuild positions outward from the common root while
preserving displacement directions. Recompute the 15 distances from those
positions, including shoulder-to-wrist and cross-arm distances. Do not assign
fixed ratios to arbitrary nonadjacent matrix entries. Fixed baseline ratios retain
current segment-length noise; forcing exact target lengths every frame would be
a different, unimplemented method.

For each method report sum of squared distance residuals divided by the target
distance vector's squared norm. Lower is closer; no acceptance threshold is
claimed. The optional single fitted global scalar is dot(observed,target) /
dot(observed,observed), applied consistently to both methods. The panel also
always shows calibrated error with scale fixed at one, making any redundancy
between segment calibration and residual scale fitting visible.

Labels never swap. Distances preserve articulation/internal angles but accept
translation, rotation, and reflection; this experimental pose similarity task
accepts reflections explicitly. It does not establish directional gesture or
chirality recognition. Missing/low-quality frames show unavailable scores.

## First physical test

Use the normal Skeleton Demo lesson at `http://localhost:3200` after the local
development watcher is ready.
Open the comparison panel, start the camera yourself, and keep both arms visible.
Capture a reference pose. Calibrate the current person while moving arms, then
return to the reference pose and compare both scores. To test differing people,
keep the same panel/template mounted, change person, and run calibration again.
Use Clear comparison before changing the reference/test session.

Try matching articulation, deliberately bent/raised elbows, similar poses with
different arm proportions, body translation/turning, and tracking loss. Repeat
with global scale on/off. Template capture is one current valid frame, so target
estimation noise is a limitation. Avoid treating one favorable score as an
accuracy result; a later labeled repeated-pose protocol is needed to compare
recognition performance fairly.

Everything stays in browser memory. Stop/switch/hide removes current scores and
pauses sample collection; template and accepted calibration samples remain until
Clear or unit unmount. No image, sample, calibration or score upload/persistence
is added. No camera was activated for the offline implementation checks.

## Offline verification

From `mofacts/`:

```text
node --test scripts/poseDistanceMatcher.test.cjs scripts/skeletonDemo.test.cjs scripts/figureGestures.test.cjs scripts/figureScene.test.cjs
node --test scripts/poseMatcherComparisonBrowser.test.cjs
npm run typecheck
npm run lint
```

The standalone panel browser fixture uses synthetic landmarks and intercepted
in-memory pages without an application server or camera. Existing full demo browser
checks require the canonical localhost watcher. Synthetic tests do not establish physical camera quality
or empirical recognition accuracy.
