const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'mofacts', 'client');
const EXTENSIONS = new Set(['.js', '.html']);

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    const ext = path.extname(entry.name);
    if (EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return '';
  }
}

function stripJsComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function stripHtmlComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

function collectTemplates(htmlFiles) {
  const templateMap = new Map();
  const templateRegex = /<template\s+name="([^"]+)"/g;
  for (const file of htmlFiles) {
    const content = stripHtmlComments(readFileSafe(file));
    let match;
    while ((match = templateRegex.exec(content)) !== null) {
      const name = match[1].trim();
      if (!name) continue;
      if (!templateMap.has(name)) {
        templateMap.set(name, new Set());
      }
      templateMap.get(name).add(file);
    }
  }
  return templateMap;
}

const TEMPLATE_API_MEMBERS = new Set([
  'instance',
  'registerHelper',
  'dynamic',
  'currentData',
  'parentData',
  'autorun',
  'view'
]);

const TEMPLATE_INCLUDE_IGNORE = new Set([
  'Template',
  'yield',
  'dynamic'
]);

function addRef(map, name, file) {
  if (!name) return;
  if (!map.has(name)) {
    map.set(name, new Set());
  }
  map.get(name).add(file);
}

function collectReferences(files) {
  const refs = new Map();
  const controllers = new Map();
  let hasDynamicTemplateUsage = false;

  const templateDotRegex = /\bTemplate\.([A-Za-z0-9_]+)/g;
  const templateBracketRegex = /\bTemplate\[['"]([^'"]+)['"]\]/g;
  const includeRegex = /\{\{\s*>\s*([A-Za-z0-9_]+)\b/g;
  const renderLayoutRegex = /\brenderLayout\([^,]+,\s*['"]([^'"]+)['"]\s*\)/g;
  const blazeLayoutRegex = /\bBlazeLayout\.render\([^,]+,\s*\{[^}]*\b(?:main|content|yield)\s*:\s*['"]([^'"]+)['"]/g;
  const currentTemplateRegex = /\bSession\.set\(\s*['"]currentTemplate['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
  const dynamicTemplateRegex = /\bTemplate\.dynamic\b/;

  for (const file of files) {
    const ext = path.extname(file);
    let content = readFileSafe(file);
    if (ext === '.js') {
      content = stripJsComments(content);
    } else if (ext === '.html') {
      content = stripHtmlComments(content);
    }
    if (dynamicTemplateRegex.test(content)) {
      hasDynamicTemplateUsage = true;
    }
    let match;
    while ((match = templateDotRegex.exec(content)) !== null) {
      const name = match[1];
      if (TEMPLATE_API_MEMBERS.has(name)) continue;
      addRef(refs, name, file);
      if (ext === '.js') {
        addRef(controllers, name, file);
      }
    }
    while ((match = templateBracketRegex.exec(content)) !== null) {
      const name = match[1];
      if (TEMPLATE_API_MEMBERS.has(name)) continue;
      addRef(refs, name, file);
      if (ext === '.js') {
        addRef(controllers, name, file);
      }
    }
    while ((match = includeRegex.exec(content)) !== null) {
      const name = match[1];
      if (TEMPLATE_INCLUDE_IGNORE.has(name)) continue;
      addRef(refs, name, file);
    }
    while ((match = renderLayoutRegex.exec(content)) !== null) {
      addRef(refs, match[1], file);
    }
    while ((match = blazeLayoutRegex.exec(content)) !== null) {
      addRef(refs, match[1], file);
    }
    while ((match = currentTemplateRegex.exec(content)) !== null) {
      addRef(refs, match[1], file);
    }
  }

  return { refs, controllers, hasDynamicTemplateUsage };
}

function formatPath(filePath) {
  return path.relative(process.cwd(), filePath);
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Missing client root: ${ROOT}`);
    process.exit(1);
  }

  const files = walk(ROOT);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const templateMap = collectTemplates(htmlFiles);
  const { refs, controllers, hasDynamicTemplateUsage } = collectReferences(files);

  const definedTemplates = Array.from(templateMap.keys()).sort();
  const referencedTemplates = Array.from(refs.keys()).sort();
  const controllerTemplates = Array.from(controllers.keys()).sort();

  const unusedTemplates = definedTemplates.filter((name) => !refs.has(name));
  const missingTemplates = referencedTemplates.filter((name) => !templateMap.has(name));
  const controllerMissingHtml = controllerTemplates.filter((name) => !templateMap.has(name));

  
  
  if (hasDynamicTemplateUsage) {
    
  }

  if (unusedTemplates.length) {
    
    for (const name of unusedTemplates) {
      const filesForTemplate = Array.from(templateMap.get(name) || []).map(formatPath).join(', ');
      
    }
  } else {
    
  }

  if (missingTemplates.length) {
    
    for (const name of missingTemplates) {
      const filesForRef = Array.from(refs.get(name) || []).map(formatPath).join(', ');
      
    }
  } else {
    
  }

  if (controllerMissingHtml.length) {
    
    for (const name of controllerMissingHtml) {
      const filesForRef = Array.from(controllers.get(name) || []).map(formatPath).join(', ');
      
    }
  } else {
    
  }
}

main();
