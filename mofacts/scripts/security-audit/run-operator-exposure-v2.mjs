import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireOperatorExposureV2, finishOperatorExposureV2 } from './core/operatorExposureV2.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    if (action === 'acquire' && args.length === 2) {
      await acquireOperatorExposureV2({ acquisitionPath: args[0], directory: args[1] });
      process.stdout.write('Staging2 exposure report assembled; inspect actual control outcomes.\n');
    } else if (action === 'finish' && args.length === 3) {
      const outcome = await finishOperatorExposureV2({ reportPath: args[0], encryptedPath: args[1], receiptPath: args[2] });
      process.stdout.write(`Staging2 report encrypted and stored; execution ${outcome.executionComplete ? 'complete' : 'incomplete'}.\n`);
      if (!outcome.executionComplete) process.exitCode = 1;
    } else throw new Error();
  } catch {
    process.stderr.write('Staging2 operator exposure workflow failed; inspect private evidence before retrying.\n');
    process.exitCode = 1;
  }
}
