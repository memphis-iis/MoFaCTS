import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStimSchemaFromRegistry,
  createTdfSchemaFromRegistry,
} from '../common/fieldRegistry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const tdfSchemaPath = path.resolve(repoRoot, 'public/tdfSchema.json');
const stimSchemaPath = path.resolve(repoRoot, 'public/stimSchema.json');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildTdfSchema() {
  return createTdfSchemaFromRegistry();
}

function buildStimSchema() {
  return createStimSchemaFromRegistry();
}

function generateSchemas() {
  const tdfSchema = buildTdfSchema();
  const stimSchema = buildStimSchema();
  writeJson(tdfSchemaPath, tdfSchema);
  writeJson(stimSchemaPath, stimSchema);
  return {
    tdfSchema,
    stimSchema,
    tdfSchemaPath,
    stimSchemaPath,
  };
}

export { tdfSchemaPath, stimSchemaPath, buildTdfSchema, buildStimSchema, generateSchemas };
