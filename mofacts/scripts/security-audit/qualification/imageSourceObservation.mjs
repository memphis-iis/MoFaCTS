import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildIdentity } from '../../../common/securityAudit/buildIdentity.ts';
import { inspectSnapshotTree, invalidSnapshot } from './sourceSnapshot.mjs';

// Runs before compilation against the shared Docker input tree. This observes
// image construction, not test execution, publication or release qualification.
export async function observeImageSource(root, expected, baseCommit, dirty) {
  if (expected === '') return { schema: 'MoFaCTSImageSourceObservationV1',
    state: 'unavailable', reason: 'not-requested' };
  if (!['true', 'false'].includes(dirty)) invalidSnapshot();
  const identity = parseBuildIdentity({ schema: 'BuildIdentityV1', baseCommit,
    includedUncommittedLocalChanges: dirty === 'true', sourceSnapshotDigestSha256: expected });
  const actual = await inspectSnapshotTree(root);
  if (actual.digestSha256 !== expected) invalidSnapshot();
  return { schema: 'MoFaCTSImageSourceObservationV1', state: 'source-matched-unqualified', identity };
}

export async function writeImageSourceObservation(root, output, expected, baseCommit, dirty) {
  const relative = path.relative(path.resolve(root), path.resolve(output));
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) invalidSnapshot();
  const observation = await observeImageSource(root, expected, baseCommit, dirty);
  await fs.writeFile(output, JSON.stringify(observation), { flag: 'wx', mode: 0o644 });
  return observation;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, output, expected, commit, dirty, ...extra] = process.argv.slice(2);
  if (!root || !output || expected === undefined || commit === undefined || dirty === undefined || extra.length) {
    process.stderr.write('Invalid image source observation arguments.\n');
    process.exitCode = 1;
  } else {
    writeImageSourceObservation(root, output, expected, commit, dirty).catch(() => {
      process.stderr.write('Image source comparison failed; no qualification was issued.\n');
      process.exitCode = 1;
    });
  }
}
