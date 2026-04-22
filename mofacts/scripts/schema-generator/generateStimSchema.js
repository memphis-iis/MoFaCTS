#!/usr/bin/env node
/**
 * Stim Schema Generator
 *
 * Analyzes stimulus JSON files from mofacts_config to generate a JSON Schema
 * using @jsonhero/schema-infer.
 *
 * Usage:
 *   cd mofacts
 *   node scripts/schema-generator/generateStimSchema.js [path-to-mofacts_config]
 *
 * Output: ../../public/stimSchema.json
 */

const fs = require('fs');
const path = require('path');
const { inferSchema } = require('@jsonhero/schema-infer');

// Default path to mofacts_config (relative to mofacts folder)
const defaultConfigPath = path.resolve(__dirname, '../../../../mofacts_config');
const configPath = process.argv[2] || defaultConfigPath;

// Output path (in mofacts/public/)
const outputPath = path.resolve(__dirname, '../../public/stimSchema.json');

/**
 * Recursively find all JSON files
 */
function findJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip certain directories
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      findJsonFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check if a JSON object is a valid stim file (has setspec.clusters structure)
 */
function isStimFile(obj) {
  return obj &&
         typeof obj === 'object' &&
         obj.setspec &&
         Array.isArray(obj.setspec.clusters) &&
         obj.setspec.clusters.length > 0 &&
         obj.setspec.clusters[0].stims;
}

/**
 * Load and parse a JSON file, returning null if invalid
 */
function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Deep merge multiple objects to create a superset structure
 * This captures all possible fields from all stim files
 */
function deepMerge(objects) {
  if (objects.length === 0) return {};
  if (objects.length === 1) return objects[0];

  const result = {};
  for (const obj of objects) {
    mergeInto(result, obj);
  }
  return result;
}

function mergeInto(target, source) {
  if (!source || typeof source !== 'object') return;

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (Array.isArray(sourceVal)) {
      // For arrays, merge all items to capture all possible structures
      if (!Array.isArray(targetVal)) {
        target[key] = [];
      }
      // Add sample items from source array
      for (const item of sourceVal) {
        if (typeof item === 'object' && item !== null) {
          // Find existing object item to merge into, or add new
          let merged = false;
          for (let i = 0; i < target[key].length; i++) {
            if (typeof target[key][i] === 'object' && target[key][i] !== null) {
              mergeInto(target[key][i], item);
              merged = true;
              break;
            }
          }
          if (!merged) {
            target[key].push(JSON.parse(JSON.stringify(item)));
          }
        } else if (target[key].length === 0) {
          target[key].push(sourceVal[0]);
        }
      }
    } else if (sourceVal !== null && typeof sourceVal === 'object') {
      // For objects, recursively merge
      if (!targetVal || typeof targetVal !== 'object') {
        target[key] = {};
      }
      mergeInto(target[key], sourceVal);
    } else {
      // For primitives, keep first non-null value or overwrite
      if (targetVal === undefined || targetVal === null) {
        target[key] = sourceVal;
      }
    }
  }
}

/**
 * Main function
 */
async function main() {
  
  
  
  

  // Find all JSON files
  
  const jsonFiles = findJsonFiles(configPath);
  

  // Load and filter to only stim files
  
  const stimFiles = [];

  for (const filePath of jsonFiles) {
    const json = loadJson(filePath);
    if (json && isStimFile(json)) {
      stimFiles.push(json);
      
    }
  }

  if (stimFiles.length === 0) {
    console.error('\nNo valid stim files found!');
    process.exit(1);
  }

  

  // Infer schema from all stim files
  // Merge all stims into one deep-merged object to capture all possible fields
  
  const mergedStim = deepMerge(stimFiles);
  

  
  const schema = inferSchema(mergedStim);
  const jsonSchema = schema.toJSONSchema();

  // Add metadata
  jsonSchema.$schema = 'http://json-schema.org/draft-07/schema#';
  jsonSchema.title = 'MoFaCTS Stimulus Schema';
  jsonSchema.description = `Auto-generated schema from ${stimFiles.length} stim files. Generated: ${new Date().toISOString()}`;

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

  // List schema structure
  
  printSchemaStructure(jsonSchema, '', 0, 4);
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
