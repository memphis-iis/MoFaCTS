const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync('./mofacts/package.json', 'utf8'));
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };



const results = {
  used: [],
  unused: [],
  uncertain: []
};

// Packages that might be used indirectly or at runtime
const specialCases = [
  'meteor-node-stubs', // Used by Meteor build system
  '@types/', // TypeScript type definitions
  'eslint', // Used by linters
  'chai', // Used in tests
  'mochawesome', // Test reporter
  'sinon' // Test mocking
];

for (const [pkg, version] of Object.entries(dependencies)) {
  // Check if it's a special case
  const isSpecial = specialCases.some(special => pkg.includes(special));

  try {
    // Search for imports/requires in .js, .jsx, .ts, .tsx files
    const searchPatterns = [
      `import.*['"]${pkg}['"]`,
      `require\\(['"]${pkg}['"]\\)`,
      `from ['"]${pkg}['"]`
    ];

    let found = false;

    for (const pattern of searchPatterns) {
      try {
        const result = execSync(
          `cd mofacts && git grep -l "${pattern}" -- "*.js" "*.jsx" "*.ts" "*.tsx" 2>/dev/null || exit 0`,
          { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );

        if (result.trim()) {
          found = true;
          results.used.push({ pkg, version, files: result.trim().split('\n').length });
          break;
        }
      } catch (e) {
        // Pattern not found, continue
      }
    }

    if (!found) {
      if (isSpecial) {
        results.uncertain.push({ pkg, version, reason: 'Build tool / Test dependency' });
      } else {
        // Try a more general search
        try {
          const generalResult = execSync(
            `cd mofacts && git grep -l "${pkg}" -- "*.js" "*.jsx" "*.ts" "*.tsx" "*.json" 2>/dev/null || exit 0`,
            { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
          );

          if (generalResult.trim()) {
            results.uncertain.push({ pkg, version, reason: 'Referenced but no direct import found' });
          } else {
            results.unused.push({ pkg, version });
          }
        } catch (e) {
          results.unused.push({ pkg, version });
        }
      }
    }
  } catch (error) {
    console.error(`Error checking ${pkg}:`, error.message);
  }
}

// Print results

results.used.forEach(({ pkg, version, files }) => {
  
});


results.uncertain.forEach(({ pkg, version, reason }) => {
  
});


results.unused.forEach(({ pkg, version }) => {
  
});



