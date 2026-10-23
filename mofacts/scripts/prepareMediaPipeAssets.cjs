// Only runtime WASM is generated here. The versioned model is source-owned.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const app = path.resolve(__dirname, '..');
const packageRoot = path.join(app, 'node_modules/@mediapipe/tasks-vision');
const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
if (metadata.version !== '0.10.35') throw new Error('MediaPipe asset preparation requires tasks-vision 0.10.35');
const model = fs.readFileSync(path.join(app, 'public/mediapipe/pose_landmarker_full.task'));
const checksum = crypto.createHash('sha256').update(model).digest('hex');
if (checksum !== '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1') {
  throw new Error('MediaPipe Full Pose model checksum does not match the pinned version');
}
fs.cpSync(path.join(packageRoot, 'wasm'), path.join(app, 'public/mediapipe/wasm'), { recursive: true });
