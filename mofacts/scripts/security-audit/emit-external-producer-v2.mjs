import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeExternalProducerFilesV2 } from './external/producerFilesV2.mjs';

// Unscheduled V2 entry point. Live probes require the selected target's explicit
// execution permission; importing this file makes no request or command call.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [profile, artifactDirectory, udpObservationPath, ...extra] = process.argv.slice(2);
  const action = ['full', 'exposure'].includes(profile) && artifactDirectory && udpObservationPath && !extra.length
    ? writeExternalProducerFilesV2({ profile, artifactDirectory, udpObservationPath }) : Promise.reject();
  action.then(({ udpObservationWritten }) => process.stdout.write(udpObservationWritten
    ? 'V2 external artifact and UDP observations written; inspect their outcomes.\n'
    : 'V2 external artifact written; UDP observations unavailable.\n'), () => {
    process.stderr.write('V2 external acquisition failed; no complete output is claimed.\n');
    process.exitCode = 1;
  });
}
