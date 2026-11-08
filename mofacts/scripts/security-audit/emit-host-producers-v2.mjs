import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeHostProducerFilesV2 } from './internal/producerFilesV2.mjs';

// Explicit file-only V2 entry point; the installed host command remains intact.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [profile, hostObservationPath, udpObservationPath, artifactDirectory, ...extra] = process.argv.slice(2);
  const action = ['full', 'exposure'].includes(profile) && hostObservationPath && udpObservationPath && artifactDirectory && !extra.length
    ? writeHostProducerFilesV2({ profile, hostObservationPath, udpObservationPath, artifactDirectory }) : Promise.reject();
  action.then(() => process.stdout.write('V2 host and composite producer artifacts written; inspect their outcomes.\n'), () => {
    process.stderr.write('V2 host artifact emission failed; no complete producer output is claimed.\n');
    process.exitCode = 1;
  });
}
