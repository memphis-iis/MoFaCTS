/**
 * Schema Usage Validator (Enhanced)
 *
 * Title: validateSchemaUsage.js
 * Purpose: Validates TDF/Stim schema completeness against codebase and documentation
 *
 * Usage: node scripts/validateSchemaUsage.js
 *
 * This script:
 * 1. Reads tdfSchema.json and stimSchema.json
 * 2. Reads tooltipContent.js for documented fields
 * 3. Searches the codebase for all field references
 * 4. Cross-references to find:
 *    - Schema fields not used in code (UNUSED)
 *    - Code fields missing from schema (MISSING FROM SCHEMA)
 *    - Documented fields missing from schema (DOC MISMATCH)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  tdfSchemaPath: path.join(__dirname, '..', 'public', 'tdfSchema.json'),
  stimSchemaPath: path.join(__dirname, '..', 'public', 'stimSchema.json'),
  tooltipPath: path.join(__dirname, '..', 'client', 'lib', 'tooltipContent.js'),
  searchDirs: [
    path.join(__dirname, '..', 'client'),
    path.join(__dirname, '..', 'server'),
    path.join(__dirname, '..', 'common'),
  ],
  excludeDirs: ['node_modules', '.meteor', '.git', 'packages'],
  fileExtensions: ['.js', '.html'],
  // Skip generic/schema-specific terms
  skipElements: new Set([
    'type', 'properties', 'items', 'required', 'additionalProperties',
    'format', 'title', 'description', '$schema', 'enum', 'default'
  ]),
  // Known parent containers (not leaf fields)
  containerFields: new Set([
    'tutor', 'setspec', 'unit', 'uiSettings', 'deliveryparams', 'learningsession',
    'assessmentsession', 'videosession', 'conditiontemplatesbygroup', 'response',
    'display', 'stims', 'clusters', 'alternateDisplays', 'unitTemplate'
  ])
};

/**
 * Recursively extract all property names from a JSON schema
 */
function extractSchemaLabels(schema, labels = new Map(), parentPath = '') {
  if (!schema || typeof schema !== 'object') return labels;

  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      if (!CONFIG.skipElements.has(key)) {
        const fullPath = parentPath ? `${parentPath}.${key}` : key;
        labels.set(key, { path: fullPath, isContainer: CONFIG.containerFields.has(key) });
      }
      extractSchemaLabels(value, labels, parentPath ? `${parentPath}.${key}` : key);
    }
  }

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach((item) => extractSchemaLabels(item, labels, parentPath));
    } else {
      extractSchemaLabels(schema.items, labels, parentPath);
    }
  }

  ['oneOf', 'anyOf', 'allOf'].forEach(key => {
    if (schema[key] && Array.isArray(schema[key])) {
      schema[key].forEach((s) => extractSchemaLabels(s, labels, parentPath));
    }
  });

  return labels;
}

/**
 * Extract documented fields from tooltipContent.js
 */
function extractTooltipFields(content) {
  const fields = new Set();
  // Match patterns like 'setspec.lessonname': or 'unit[].deliveryparams.drill':
  const regex = /['"]([a-zA-Z[\].]+)['"]\s*:\s*{/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1];
    // Extract the leaf field name
    const parts = path.replace(/\[\]/g, '').split('.');
    const leafField = parts[parts.length - 1];
    if (leafField && !CONFIG.skipElements.has(leafField)) {
      fields.add(leafField);
    }
  }
  return fields;
}

/**
 * Get all files to search
 */
function getFilesToSearch(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!CONFIG.excludeDirs.includes(entry.name)) {
        getFilesToSearch(fullPath, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CONFIG.fileExtensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/**
 * Remove comments from code
 */
function removeComments(code, _ext) {
  // Remove single-line comments
  code = code.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove HTML comments
  code = code.replace(/<!--[\s\S]*?-->/g, '');
  return code;
}

/**
 * Search for a label in file content
 */
function searchInFile(filePath, label) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();
    content = removeComments(content, ext);

    const patterns = [
      new RegExp(`\\.${label}\\b`, 'g'),
      new RegExp(`\\['${label}'\\]`, 'g'),
      new RegExp(`\\["${label}"\\]`, 'g'),
      new RegExp(`\\b${label}\\s*:`, 'g'),
      new RegExp(`"${label}"\\s*:`, 'g'),
      new RegExp(`'${label}'\\s*:`, 'g'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Search for a label across all files
 */
function searchForLabel(files, label) {
  const foundIn = [];
  for (const file of files) {
    if (searchInFile(file, label)) {
      foundIn.push(path.relative(path.join(__dirname, '..'), file));
    }
  }
  return foundIn;
}

/**
 * Extract field references from code using pattern matching
 */
function extractCodeFields(files) {
  const fields = new Map();

  // Patterns to find field access
  const patterns = [
    // Object property access: obj.field, setspec.field
    /(?:setspec|deliveryparams|uiSettings|learningsession|assessmentsession|videosession|display|response|cluster|stim|unit)\.(\w+)/g,
    // Bracket access with quotes
    /\[['"](\w+)['"]\]/g,
  ];

  // Known parent objects to look for
  for (const file of files) {
    try {
      let content = fs.readFileSync(file, 'utf8');
      content = removeComments(content, path.extname(file));

      for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
          const field = match[1];
          if (field && !CONFIG.skipElements.has(field) && field.length > 1) {
            if (!fields.has(field)) {
              fields.set(field, []);
            }
            const relPath = path.relative(path.join(__dirname, '..'), file);
            if (!fields.get(field).includes(relPath)) {
              fields.get(field).push(relPath);
            }
          }
        }
      }
    } catch (err) {
      // Skip unreadable files
    }
  }

  return fields;
}

/**
 * Main function
 */
function main() {

  // Load schemas
  let tdfSchema, stimSchema;
  try {
    tdfSchema = JSON.parse(fs.readFileSync(CONFIG.tdfSchemaPath, 'utf8'));
  } catch (err) {
    console.error(`✗ Failed to load TDF schema: ${err.message}`);
    process.exit(1);
  }

  try {
    stimSchema = JSON.parse(fs.readFileSync(CONFIG.stimSchemaPath, 'utf8'));
  } catch (err) {
    console.error(`✗ Failed to load Stim schema: ${err.message}`);
    process.exit(1);
  }

  // Load tooltip content
  let tooltipContent = '';
  let tooltipFields = new Set();
  try {
    tooltipContent = fs.readFileSync(CONFIG.tooltipPath, 'utf8');
    tooltipFields = extractTooltipFields(tooltipContent);
  } catch (err) {
    // Tooltip file is optional; continue with schema-only validation.
  }

  // Extract schema labels
  const tdfLabels = extractSchemaLabels(tdfSchema);
  const stimLabels = extractSchemaLabels(stimSchema);

  // Combine all schema labels
  const allSchemaLabels = new Map();
  for (const [label, info] of tdfLabels) {
    allSchemaLabels.set(label, { ...info, sources: ['TDF'] });
  }
  for (const [label, info] of stimLabels) {
    if (allSchemaLabels.has(label)) {
      allSchemaLabels.get(label).sources.push('Stim');
    } else {
      allSchemaLabels.set(label, { ...info, sources: ['Stim'] });
    }
  }


  // Get files and search
  const files = [];
  for (const dir of CONFIG.searchDirs) {
    getFilesToSearch(dir, files);
  }

  // Extract fields from code
  const codeFields = extractCodeFields(files);

  // Cross-reference analysis
  const schemaUsed = [];
  const schemaUnused = [];
  const missingFromSchema = [];
  const documentedNotInSchema = [];

  // Check schema fields against code
  for (const [label, info] of allSchemaLabels) {
    if (info.isContainer) continue; // Skip container fields

    const foundIn = searchForLabel(files, label);
    if (foundIn.length > 0) {
      schemaUsed.push({ label, sources: info.sources, foundIn });
    } else {
      schemaUnused.push({ label, sources: info.sources, path: info.path });
    }
  }

  // Check code fields against schema
  for (const [field, locations] of codeFields) {
    if (CONFIG.containerFields.has(field)) continue;
    if (!allSchemaLabels.has(field) && !CONFIG.skipElements.has(field)) {
      // Check if it's a plausible TDF/Stim field (not just any JS variable)
      const isLikelySchemaField = locations.some(loc =>
        loc.includes('card.js') ||
        loc.includes('unitEngine.js') ||
        loc.includes('currentTestingHelpers.js') ||
        loc.includes('methods.js') ||
        loc.includes('tooltipContent.js')
      );
      if (isLikelySchemaField && field.length > 2) {
        missingFromSchema.push({ field, locations: locations.slice(0, 5) });
      }
    }
  }

  // Check documented fields against schema
  for (const field of tooltipFields) {
    if (!allSchemaLabels.has(field) && !CONFIG.containerFields.has(field)) {
      documentedNotInSchema.push(field);
    }
  }

  // Generate report
  
  
  
  

  // Summary
  
  
  
  
  
  
  
  

  // CRITICAL: Fields in code but not in schema
  if (missingFromSchema.length > 0) {
    
    
    
    

    // Group by likely category
    const groupedMissing = {
      'setspec fields': [],
      'deliveryparams fields': [],
      'uiSettings fields': [],
      'unit fields': [],
      'session fields': [],
      'stim fields': [],
      'other': []
    };

    for (const { field, locations } of missingFromSchema) {
      const sampleLoc = locations[0] || '';
      let category = 'other';

      if (sampleLoc.includes('setspec') || field.includes('audio') || field.includes('speech')) {
        category = 'setspec fields';
      } else if (field.includes('display') || field.includes('timeout') || field.includes('Color')) {
        category = 'uiSettings fields';
      } else if (field.includes('seconds') || field.includes('time') || field.includes('score')) {
        category = 'deliveryparams fields';
      } else if (field.includes('stim') || field.includes('cluster') || field.includes('Response')) {
        category = 'stim fields';
      } else if (field.includes('unit') || field.includes('session')) {
        category = 'unit fields';
      }

      groupedMissing[category].push({ field, locations });
    }

    for (const [_category, items] of Object.entries(groupedMissing)) {
      if (items.length > 0) {
        
        for (const { field: _field, locations: _locations } of items) {
          // Missing field details are rendered in the final report output.
        }
      }
    }
  }

  // Documented but not in schema
  if (documentedNotInSchema.length > 0) {
    // Placeholder for optional strict-mode reporting.
  }

  // Unused schema fields
  if (schemaUnused.length > 0) {
    for (const { label: _label, sources: _sources, path: _path } of schemaUnused) {
      // Placeholder for optional strict-mode reporting.
    }
  }

  // Used schema fields (condensed)

  // Save detailed JSON report
  const reportPath = path.join(__dirname, 'schema-usage-report.json');
  const jsonReport = {
    generated: new Date().toISOString(),
    summary: {
      schemaFieldsTotal: allSchemaLabels.size,
      schemaFieldsUsed: schemaUsed.length,
      schemaFieldsUnused: schemaUnused.length,
      codeFieldsMissingFromSchema: missingFromSchema.length,
      documentedFieldsMissingFromSchema: documentedNotInSchema.length
    },
    missingFromSchema: missingFromSchema,
    documentedNotInSchema: documentedNotInSchema,
    schemaUnused: schemaUnused,
    schemaUsed: schemaUsed.map(s => ({ label: s.label, sources: s.sources }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(jsonReport, null, 2));
}

main();
