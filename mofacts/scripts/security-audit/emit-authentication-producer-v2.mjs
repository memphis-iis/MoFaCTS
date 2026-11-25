import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSelectedAuthenticationProducerFileV2 } from './authentication/producerFilesV2.mjs';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [observationPath, artifactDirectory, ...extra] = process.argv.slice(2);
  const action = observationPath && artifactDirectory && !extra.length
    ? writeSelectedAuthenticationProducerFileV2({ observationPath, artifactDirectory }) : Promise.reject();
  action.then(() => process.stdout.write('V2 authentication artifact written; deferred or unavailable scenarios remain ERROR.\n'), () => {
    process.stderr.write('V2 authentication artifact emission failed.\n'); process.exitCode = 1;
  });
}
