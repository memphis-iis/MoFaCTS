#!/usr/bin/env node
/**
 * TDF Schema Generator
 *
 * Analyzes TDF JSON files from mofacts_config to generate a JSON Schema
 * using @jsonhero/schema-infer.
 *
 * Usage:
 *   npm install @jsonhero/schema-infer
 *   node scripts/generateTdfSchema.js [path-to-mofacts_config]
 *
 * Output: common/tdfSchema.json
 */

const fs = require('fs');
const path = require('path');

// Check if schema-infer is installed
let inferSchema;
try {
  const schemaInfer = require('@jsonhero/schema-infer');
  inferSchema = schemaInfer.inferSchema;
} catch (e) {
  console.error('Error: @jsonhero/schema-infer not installed.');
  console.error('Run: npm install @jsonhero/schema-infer');
  process.exit(1);
}

// Default path to mofacts_config (sibling to mofacts folder)
const defaultConfigPath = path.resolve(__dirname, '../../../mofacts_config');
const configPath = process.argv[2] || defaultConfigPath;

// Output path
const outputPath = path.resolve(__dirname, '../public/tdfSchema.json');

/**
 * Recursively find all JSON files matching TDF patterns
 */
function findTdfFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip certain directories
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'old') {
        continue;
      }
      findTdfFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      // Match TDF files - they contain "TDF" or "tdf" in name, OR are the main config file
      // Also include files that look like TDF configs (contain tutor.setspec structure)
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check if a JSON object is a valid TDF (has tutor.setspec structure)
 */
function isTdf(obj) {
  return obj &&
         typeof obj === 'object' &&
         obj.tutor &&
         obj.tutor.setspec &&
         obj.tutor.setspec.lessonname;
}

/**
 * Load and parse a JSON file, returning null if invalid
 */
function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.warn(`  Skipping (invalid JSON): ${path.basename(filePath)}`);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  
  
  
  

  // Find all JSON files
  
  const jsonFiles = findTdfFiles(configPath);
  

  // Load and filter to only TDFs
  
  const tdfs = [];
  const tdfPaths = [];

  for (const filePath of jsonFiles) {
    const json = loadJson(filePath);
    if (json && isTdf(json)) {
      tdfs.push(json);
      tdfPaths.push(filePath);
      
    }
  }

  if (tdfs.length === 0) {
    console.error('\nNo valid TDF files found!');
    process.exit(1);
  }

  

  // Infer schema from all TDFs
  

  let schema = inferSchema(tdfs[0]);
  for (let i = 1; i < tdfs.length; i++) {
    schema = schema.update(tdfs[i]);
    if ((i + 1) % 10 === 0) {
      // Progress checkpoint retained for optional verbose logging.
    }
  }

  // Convert to JSON Schema
  const jsonSchema = schema.toJSONSchema();

  // Add metadata
  jsonSchema.$schema = 'http://json-schema.org/draft-07/schema#';
  jsonSchema.title = 'MoFaCTS TDF Schema';
  jsonSchema.description = `Auto-generated schema from ${tdfs.length} TDF files. Generated: ${new Date().toISOString()}`;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write schema
  fs.writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));
  

  // Print summary
  
  
  
  if (jsonSchema.properties) {
    // Schema root properties present; structure output is generated below.
  }

  // List some key paths found
  
  printSchemaStructure(jsonSchema, '', 0, 3);
}

/**
 * Print schema structure (limited depth)
 */
function printSchemaStructure(schema, prefix, depth, maxDepth) {
  if (depth >= maxDepth) return;

  if (schema.properties) {
    for (const [_key, value] of Object.entries(schema.properties)) {
      if (value.type === 'object' || value.properties) {
        printSchemaStructure(value, prefix + '  ', depth + 1, maxDepth);
      } else if (value.type === 'array' && value.items) {
        if (value.items.type === 'object' || value.items.properties) {
          
          printSchemaStructure(value.items, prefix + '    ', depth + 1, maxDepth);
        }
      }
    }
  }
}

// Run
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
