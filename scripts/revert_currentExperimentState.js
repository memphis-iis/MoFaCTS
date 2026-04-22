#!/usr/bin/env node
/**
 * HOTFIX: Revert currentExperimentState back to Session
 * Reason: It's shared between card.js and unitEngine.js, so must be global
 */

const fs = require('fs');
const path = require('path');

const CARD_JS_PATH = path.join(__dirname, '../mofacts/client/views/experiment/card.js');

function revertCurrentExperimentState() {
  

  let content = fs.readFileSync(CARD_JS_PATH, 'utf8');

  // Count before
  const beforeGet = (content.match(/cardState\.get\('currentExperimentState'\)/g) || []).length;
  const beforeSet = (content.match(/cardState\.set\('currentExperimentState'/g) || []).length;

  

  // Revert get calls
  content = content.replace(/cardState\.get\('currentExperimentState'\)/g, "Session.get('currentExperimentState')");

  // Revert set calls
  content = content.replace(/cardState\.set\('currentExperimentState'/g, "Session.set('currentExperimentState'");

  // Count after
  const afterGet = (content.match(/Session\.get\('currentExperimentState'\)/g) || []).length;
  const afterSet = (content.match(/Session\.set\('currentExperimentState'/g) || []).length;

  

  // Write back
  fs.writeFileSync(CARD_JS_PATH, content, 'utf8');

  
  
}

revertCurrentExperimentState();
