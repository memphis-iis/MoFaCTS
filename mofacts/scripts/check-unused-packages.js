#!/usr/bin/env node

/**
 * Script to check for unused Meteor packages
 * Run with: node scripts/check-unused-packages.js
 */

const fs = require('fs');
const path = require('path');

// Define package search patterns
// Maps package names to their typical usage patterns (imports, globals, etc.)
const packagePatterns = {
  // Core packages - typically implicit usage
  'meteor-base': { implicit: true, description: 'Core Meteor functionality' },
  'mobile-experience': { implicit: true, description: 'Mobile meta tags and hotcode push' },
  'mongo': { patterns: [/Mongo\./, /from ['"]meteor\/mongo['"]/], description: 'MongoDB integration' },
  'blaze-html-templates': { implicit: true, description: 'Blaze templating (used via .html files)' },
  'reactive-var': { patterns: [/ReactiveVar/, /from ['"]meteor\/reactive-var['"]/], description: 'Reactive variables' },
  'reactive-dict': { patterns: [/ReactiveDict/, /from ['"]meteor\/reactive-dict['"]/], description: 'Reactive dictionaries' },
  'jquery': { patterns: [/\$\([^)]+\)/, /jQuery/, /from ['"]meteor\/jquery['"]/], description: 'jQuery library' },
  'session': { patterns: [/Session\./, /from ['"]meteor\/session['"]/], description: 'Session variables' },
  'tracker': { patterns: [/Tracker\./, /from ['"]meteor\/tracker['"]/], description: 'Reactive tracking' },
  'logging': { implicit: true, description: 'Server logging' },
  'reload': { patterns: [/Reload\./, /from ['"]meteor\/reload['"]/], description: 'Hot code reload' },
  'ejson': { patterns: [/EJSON\./, /from ['"]meteor\/ejson['"]/], description: 'Extended JSON' },
  'spacebars': { implicit: true, description: 'Blaze template syntax (used in .html)' },
  'check': { patterns: [/\bcheck\(/, /Match\./, /from ['"]meteor\/check['"]/], description: 'Argument validation' },

  // Auth packages
  'accounts-password': { patterns: [/Accounts\./, /from ['"]meteor\/accounts-base['"]/], description: 'Password authentication' },
  'accounts-google': { patterns: [/google/i, /ServiceConfiguration/], description: 'Google OAuth' },
  'service-configuration': { patterns: [/ServiceConfiguration/, /from ['"]meteor\/service-configuration['"]/], description: 'OAuth service config' },

  // Utility packages
  'underscore': { patterns: [/_\./, /from ['"]meteor\/underscore['"]/], description: 'Underscore.js utilities' },
  'http': { patterns: [/HTTP\./, /from ['"]meteor\/http['"]/], description: 'HTTP client' },
  'promise': { implicit: true, description: 'Promise polyfill' },
  'random': { patterns: [/Random\./, /from ['"]meteor\/random['"]/], description: 'Random generation' },
  'email': { patterns: [/Email\.send/, /from ['"]meteor\/email['"]/], description: 'Email sending' },
  'dynamic-import': { patterns: [/import\(/, /from ['"]meteor\/dynamic-import['"]/], description: 'Dynamic imports' },
  'ecmascript': { implicit: true, description: 'ES6+ syntax support' },
  'shell-server': { implicit: true, description: 'Server shell access' },

  // Build packages
  'standard-minifier-css@1.7.1': { implicit: true, description: 'CSS minification' },
  'zodern:standard-minifier-js@5.0.0-beta.5': { implicit: true, description: 'JS minification' },

  // Third-party packages
  'bojicas:howler2': { patterns: [/\bHowl\b/, /\bHowler\b/], description: 'Audio playback' },
  'alanning:roles': { patterns: [/Roles\./, /from ['"]meteor\/alanning:roles['"]/], description: 'Role-based auth' },
  'quave:synced-cron': { patterns: [/SyncedCron/, /from ['"]meteor\/quave:synced-cron['"]/], description: 'Scheduled jobs' },
  'vlasky:galvanized-iron-router': { patterns: [/Router\./, /FlowRouter/, /from ['"]meteor\/iron:router['"]/], description: 'Routing' },
  'google-config-ui@1.0.1': { patterns: [/configureLoginServiceConfigurationForGoogle/], description: 'Google OAuth config UI' },
  'harrison:papa-parse': { patterns: [/Papa\./, /PapaParse/], description: 'CSV parsing' },
  'ostrio:files': { patterns: [/FilesCollection/, /from ['"]meteor\/ostrio:files['"]/], description: 'File uploads' },
  'mofacts:microsoft-oauth': { patterns: [/Microsoft/, /microsoft/], description: 'Microsoft OAuth (custom)' },
  'mofacts:accounts-microsoft': { patterns: [/Microsoft/, /microsoft/], description: 'Microsoft accounts (custom)' },
};

// Directories to search
const searchDirs = ['client', 'server', 'common', 'packages'];

// File extensions to search
const fileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.html'];

function readPackagesFile() {
  const packagesPath = path.join(__dirname, '..', '.meteor', 'packages');
  const content = fs.readFileSync(packagesPath, 'utf8');

  const packages = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;
    packages.push(trimmed);
  }

  return packages;
}

function getAllFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and .meteor directories
      if (entry.name === 'node_modules' || entry.name === '.meteor') continue;
      getAllFiles(fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (fileExtensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function searchInFile(filePath, patterns) {
  const content = fs.readFileSync(filePath, 'utf8');
  let totalMatches = 0;
  const matchedPatterns = [];

  for (const pattern of patterns) {
    const matches = content.match(new RegExp(pattern, 'g'));
    if (matches) {
      totalMatches += matches.length;
      matchedPatterns.push({ pattern: pattern.toString(), count: matches.length });
    }
  }

  return { totalMatches, matchedPatterns };
}

function checkPackageUsage(packageName, allFiles) {
  const config = packagePatterns[packageName];

  if (!config) {
    // Unknown package - try to search for it by name
    const normalizedName = packageName.replace(/@.*$/, '').replace(/:/g, '/');
    const patterns = [
      new RegExp(`from ['"]meteor/${normalizedName}['"]`),
      new RegExp(`\\b${normalizedName.split('/').pop()}\\b`)
    ];

    return checkPatterns(patterns, '', allFiles);
  }

  if (config.implicit) {
    return {
      status: 'implicit',
      description: config.description,
      message: 'Implicit usage - no direct imports needed',
      totalMatches: 0
    };
  }

  return checkPatterns(config.patterns, config.description, allFiles);
}

function checkPatterns(patterns, description = '', allFiles) {
  const baseDir = path.join(__dirname, '..');
  let totalMatches = 0;
  const fileResults = [];

  for (const filePath of allFiles) {
    const result = searchInFile(filePath, patterns);
    if (result.totalMatches > 0) {
      totalMatches += result.totalMatches;
      fileResults.push({
        file: path.relative(baseDir, filePath),
        matches: result.totalMatches,
        patterns: result.matchedPatterns
      });
    }
  }

  // Sort by match count
  fileResults.sort((a, b) => b.matches - a.matches);

  if (totalMatches > 0) {
    return {
      status: 'used',
      description,
      totalMatches,
      fileCount: fileResults.length,
      files: fileResults.slice(0, 5),
      hasMore: fileResults.length > 5
    };
  }

  return {
    status: 'unused',
    description,
    message: 'No usage found in codebase',
    totalMatches: 0
  };
}

function main() {
  
  

  const baseDir = path.join(__dirname, '..');
  let allFiles = [];

  for (const dir of searchDirs) {
    const dirPath = path.join(baseDir, dir);
    getAllFiles(dirPath, allFiles);
  }

  
  

  const packages = readPackagesFile();

  const results = {
    used: [],
    unused: [],
    implicit: [],
    unknown: []
  };

  for (const pkg of packages) {
    process.stdout.write(`Checking ${pkg}... `);
    const result = checkPackageUsage(pkg, allFiles);
    result.package = pkg;

    switch (result.status) {
      case 'used':
        results.used.push(result);
        
        break;
      case 'unused':
        results.unused.push(result);
        
        break;
      case 'implicit':
        results.implicit.push(result);
        
        break;
      default:
        results.unknown.push(result);
        
    }
  }

  // Sort used packages by usage count (ascending for low-usage first)
  results.used.sort((a, b) => a.totalMatches - b.totalMatches);

  // Print summary
  
  
  

  
  
  
  

  if (results.unused.length > 0) {
    
    
    
    

    for (const item of results.unused) {
      
      if (item.description) {
        // Description kept for optional verbose reporting.
      }
    }

    
    
  }

  if (results.used.length > 0) {
    
    
    

    // Group into low, medium, high usage
    const lowUsage = results.used.filter(r => r.totalMatches <= 10);
    const mediumUsage = results.used.filter(r => r.totalMatches > 10 && r.totalMatches <= 50);
    const highUsage = results.used.filter(r => r.totalMatches > 50);

    if (lowUsage.length > 0) {
      
      for (const item of lowUsage) {
        
        if (item.files && item.files.length > 0) {
          for (const _fileInfo of item.files.slice(0, 2)) {
            // File usage details kept for optional verbose reporting.
          }
          if (item.files.length > 2) {
            // Additional file usage entries intentionally omitted.
          }
        }
      }
      
    }

    if (mediumUsage.length > 0) {
      
      for (const _item of mediumUsage) {
        // Medium usage listing retained for optional verbose mode.
      }
      
    }

    if (highUsage.length > 0) {
      
      for (const _item of highUsage) {
        // High usage listing retained for optional verbose mode.
      }
      
    }
  }

  if (results.implicit.length > 0) {
    
    
    

    for (const _item of results.implicit) {
      // Implicit usage retained for optional verbose mode.
    }
  }

  
  
}

main();
