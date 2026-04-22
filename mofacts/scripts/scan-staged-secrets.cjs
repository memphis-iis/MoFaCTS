#!/usr/bin/env node

const { execSync } = require('node:child_process');

const secretPatterns = [
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'GitHub Token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'Slack Token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Private Key Header', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Mongo URI with credentials', regex: /\bmongodb(?:\+srv)?:\/\/[^/\s:@]+:[^@\s]+@/i },
];

function getStagedAdditions() {
  const output = execSync('git diff --cached --unified=0 --no-color', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return output
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
}

function main() {
  if (process.env.SKIP_SECRET_SCAN === '1') {
    process.exit(0);
  }

  let addedLines = [];
  try {
    addedLines = getStagedAdditions();
  } catch (error) {
    console.error('Failed to scan staged changes for secrets.');
    console.error(error.message);
    process.exit(1);
  }

  const findings = [];

  for (const line of addedLines) {
    for (const pattern of secretPatterns) {
      if (pattern.regex.test(line)) {
        findings.push({ pattern: pattern.name, line: line.trim() });
      }
    }
  }

  if (findings.length > 0) {
    console.error('Potential secrets detected in staged changes:');
    for (const finding of findings) {
      console.error(`- ${finding.pattern}: ${finding.line.slice(0, 120)}`);
    }
    console.error('Commit blocked. Remove secrets or set SKIP_SECRET_SCAN=1 to bypass intentionally.');
    process.exit(1);
  }
}

main();
