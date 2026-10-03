// WebGazer 3.5.3 resolves MediaPipe assets at runtime; serve the pinned package locally.
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname, '..');
fs.cpSync(path.join(app, 'node_modules/webgazer/dist/mediapipe'),
  path.join(app, 'public/webgazer/mediapipe'), { recursive: true });

fs.copyFileSync(path.join(app, 'scripts/licenses/mediapipe-LICENSE'),
  path.join(app, 'public/webgazer/mediapipe-LICENSE'));
fs.writeFileSync(path.join(app, 'public/webgazer/NOTICE.txt'),
  'MediaPipe Face Mesh assets packaged by WebGazer 3.5.3. Copyright Google LLC. Apache-2.0.\n' +
  'Source: https://github.com/google-ai-edge/mediapipe ; upstream package metadata retained in mediapipe/face_mesh/package.json.\n');
