#!/usr/bin/env node
/**
 * Preview M1 Migration: Shows what will change without modifying files
 */

const fs = require('fs');
const path = require('path');

// Load categorized keys
const CARD_SCOPED = require('./card_scoped_keys.json');

// File paths
const CARD_JS_PATH = path.join(__dirname, '../mofacts/client/views/experiment/card.js');

function previewMigration() {
  

  const content = fs.readFileSync(CARD_JS_PATH, 'utf8');
  const lines = content.split('\n');

  const changes = [];
  let totalChanges = 0;

  // Find all lines that will change
  lines.forEach((line, lineNum) => {
    let changed = false;
    let newLine = line;

    CARD_SCOPED.forEach(key => {
      const getPattern = new RegExp(`Session\\.get\\('${escapeRegex(key)}'\\)`, 'g');
      const setPattern = new RegExp(`Session\\.set\\('${escapeRegex(key)}'`, 'g');

      if (getPattern.test(line) || setPattern.test(line)) {
        changed = true;
        newLine = newLine
          .replace(getPattern, `cardState.get('${key}')`)
          .replace(setPattern, `cardState.set('${key}'`);
      }
    });

    if (changed) {
      changes.push({
        lineNum: lineNum + 1,
        before: line.trim(),
        after: newLine.trim(),
        key: extractKey(line)
      });
      totalChanges++;
    }
  });

  // Show preview
  
  

  changes.slice(0, 20).forEach((change, i) => {
    
    
    
    
  });

  if (changes.length > 20) {
    
  }

  // Summary by key
  
  const keyStats = {};
  changes.forEach(change => {
    keyStats[change.key] = (keyStats[change.key] || 0) + 1;
  });

  Object.entries(keyStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([key, count]) => {
      
    });

  
  
  
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractKey(line) {
  const match = line.match(/Session\.[gs]et\('([^']+)'/);
  return match ? match[1] : 'unknown';
}

if (require.main === module) {
  previewMigration();
}
