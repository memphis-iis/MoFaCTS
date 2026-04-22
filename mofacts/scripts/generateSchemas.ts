import { generateSchemas } from './schemaGeneration.ts';

function main() {
  const result = generateSchemas();
  console.log(`Wrote ${result.tdfSchemaPath}`);
  console.log(`Wrote ${result.stimSchemaPath}`);
}

main();
