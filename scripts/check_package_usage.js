const fs = require('fs');
const path = require('path');

// Recursively find all js/jsx/ts/tsx files
function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and .meteor
      if (file !== 'node_modules' && file !== '.meteor' && file !== '.npm') {
        findFiles(filePath, fileList);
      }
    } else if (/\.(js|jsx|ts|tsx|html)$/.test(file)) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Check if a package is used in any file
function findPackageUsage(packageName, files) {
  const usageFiles = [];

  // Create regex patterns to match imports/requires
  const patterns = [
    new RegExp(`require\\(['"\`]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\)`, 'g'),
    new RegExp(`from ['"\`]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g'),
    new RegExp(`import ['"\`]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g'),
    new RegExp(`import .* from ['"\`]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g'),
  ];

  files.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          usageFiles.push(file.replace(/\\/g, '/').split('mofacts/')[1]);
          break;
        }
      }
    } catch (err) {
      // Skip files that can't be read
    }
  });

  return usageFiles;
}

// Main execution


const mofactsDir = path.join(__dirname, 'mofacts');
const packageJsonPath = path.join(mofactsDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const allDeps = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
};

const files = findFiles(mofactsDir);


const results = {
  used: [],
  unused: [],
  special: []
};

// Packages that are used indirectly
const specialPackages = {
  'meteor-node-stubs': 'Used by Meteor build system',
  '@types/jquery': 'TypeScript type definitions',
  '@types/meteor': 'TypeScript type definitions',
  '@types/meteor-roles': 'TypeScript type definitions',
  '@types/underscore': 'TypeScript type definitions',
  'eslint': 'Linter tool',
  '@eslint/js': 'ESLint recommended config',
  'globals': 'ESLint globals definitions',
  'chai': 'Test framework',
  'mochawesome': 'Test reporter',
  '@sinonjs/referee-sinon': 'Test utilities',
  'sinon': 'Test mocking',
  'expect': 'Test assertions',
  'pretty-format': 'Test output formatting',
  '@babel/runtime': 'Babel polyfills (auto-imported)',
  'core-js': 'Polyfills (may be auto-imported)',
  'util': 'Node.js core module polyfill',
  'http': 'Node.js core module polyfill',
  'punycode': 'Usually a dependency of other packages',
  'plyr': 'Loaded from CDN (see client/index.html)'
};

Object.entries(allDeps).forEach(([pkg, version]) => {
  if (specialPackages[pkg]) {
    results.special.push({ pkg, version, reason: specialPackages[pkg] });
  } else {
    const usage = findPackageUsage(pkg, files);
    if (usage.length > 0) {
      results.used.push({ pkg, version, files: usage });
    } else {
      results.unused.push({ pkg, version });
    }
  }
});

// Print results



results.used.forEach(({ pkg, version, files }) => {
  
  
  files.slice(0, 3).forEach(f => );
  if (files.length > 3) {
    
  }
});




results.special.forEach(({ pkg, version, reason }) => {
  
  
});




if (results.unused.length === 0) {
  
} else {
  results.unused.forEach(({ pkg, version }) => {
    
  });
  
}




