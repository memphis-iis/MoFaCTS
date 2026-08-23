import { internalExecutionError } from './internal-audit-contract.mjs';
import { writeJsonFile } from './audit-lib.mjs';

const [outputPath, category] = process.argv.slice(2);
if (!outputPath || !category) {
  throw new Error('usage: write-internal-execution-error.mjs <output> <category>');
}

await writeJsonFile(outputPath, internalExecutionError(category));
