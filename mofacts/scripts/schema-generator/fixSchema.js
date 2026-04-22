#!/usr/bin/env node
/**
 * Fix TDF Schema - Remove overly aggressive required fields
 *
 * Only keeps truly required: tutor, setspec, lessonname, stimulusfile, unit
 * Adds additionalProperties: true for flexibility
 */

const fs = require('fs');
const path = require('path');

const schemaPath = path.resolve(__dirname, '../../public/tdfSchema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Truly required fields (paths)
const trulyRequired = {
  '': ['tutor'],                              // root requires tutor
  'tutor': ['setspec', 'unit'],               // tutor requires setspec and unit
  'tutor.setspec': ['lessonname', 'stimulusfile']  // setspec requires these
};

/**
 * Recursively process schema to remove required arrays and add additionalProperties
 */
function processSchema(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;

  // Remove required array unless in trulyRequired
  if (obj.required) {
    const allowed = trulyRequired[path];
    if (allowed) {
      obj.required = obj.required.filter(r => allowed.includes(r));
      if (obj.required.length === 0) delete obj.required;
    } else {
      delete obj.required;
    }
  }

  // Add additionalProperties for flexibility (allow unknown fields)
  if (obj.type === 'object' && obj.properties) {
    obj.additionalProperties = true;
  }

  // Process nested properties
  if (obj.properties) {
    for (const [key, value] of Object.entries(obj.properties)) {
      const newPath = path ? `${path}.${key}` : key;
      processSchema(value, newPath);
    }
  }

  // Process array items
  if (obj.items) {
    if (Array.isArray(obj.items)) {
      obj.items.forEach((item, i) => processSchema(item, `${path}[${i}]`));
    } else {
      processSchema(obj.items, `${path}[]`);
    }
  }

  // Process anyOf/oneOf/allOf
  ['anyOf', 'oneOf', 'allOf'].forEach(key => {
    if (obj[key]) {
      obj[key].forEach((item, i) => processSchema(item, `${path}(${key}[${i}])`));
    }
  });
}

// Process the schema
processSchema(schema);

// Update metadata
schema.description = `TDF Schema with optional fields. Only lessonname and stimulusfile are required. Generated: ${new Date().toISOString()}`;

// Write back
fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));






