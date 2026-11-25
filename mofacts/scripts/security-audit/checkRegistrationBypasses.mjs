import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { componentRegistrationReferences, directFrameworkRegistrationReferences, packageRegistrationReferences } from './checkApplicationMeteorRegistration.mjs';

const sourceRepoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const appRoot = path.join(sourceRepoRoot, 'mofacts');

async function filesUnder(directory, packageSource = false) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (packageSource && (entry.name.startsWith('.') || ['node_modules', 'tests'].includes(entry.name) || entry.name.endsWith('.d.ts'))) continue;
    if (entry.isDirectory()) files.push(...await filesUnder(full, packageSource));
    else if (entry.isFile() && /\.(?:[cm]?[jt]s|svelte)$/.test(entry.name) && !/\.test\.[cm]?[jt]s$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function checkedApplicationSource(file, packageOwner, microsoftOwner) {
  const text = await fs.readFile(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const options = {
    clientOnly: file.startsWith(path.join(appRoot, 'client') + path.sep),
    collectionModule: path.join(appRoot, 'common', 'Collections.ts'),
  };
  const bypasses = file.endsWith('.svelte') ? componentRegistrationReferences(file, text, options) :
    packageOwner !== undefined ? packageRegistrationReferences(source, packageOwner, microsoftOwner) :
      directFrameworkRegistrationReferences(source, undefined, options);
  if (bypasses.length) {
    throw new Error(bypasses.map(({ member, line }) =>
      path.relative(sourceRepoRoot, file) + ':' + line + ' references ' + (member.includes('.') ? member : 'Meteor.' + member) + ' outside its registration owner.'
    ).join('\n'));
  }
}

// Enforce source registration ownership. The installed registry supplies the
// runtime inventory and its policy, egress and verification classifications.
export async function checkRegistrationBypasses() {
  for (const root of [path.join(appRoot, 'common'), path.join(appRoot, 'client'), path.join(sourceRepoRoot, 'learning-components')]) {
    for (const file of await filesUnder(root)) await checkedApplicationSource(file);
  }
  const pkgRoot = path.join(appRoot, 'packages');
  const uploadOwner = path.join(pkgRoot, 'ostrio-files', 'server.js');
  const microsoftOwners = new Map([
    [path.join(pkgRoot, 'mofacts-accounts-microsoft', 'server', 'microsoft.js'), 'accounts'],
    [path.join(pkgRoot, 'mofacts-microsoft-oauth', 'server', 'microsoft.js'), 'provider'],
  ]);
  let foundUploadOwner = false;
  for (const entry of await fs.readdir(pkgRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(pkgRoot, entry.name);
    if (!(await fs.readdir(directory)).includes('package.js')) continue;
    for (const file of await filesUnder(directory, true)) {
      const isUploadOwner = file === uploadOwner;
      await checkedApplicationSource(file, isUploadOwner, microsoftOwners.get(file));
      microsoftOwners.delete(file);
      if (isUploadOwner) foundUploadOwner = true;
    }
  }
  if (!foundUploadOwner) throw new Error('Missing maintained upload package registration owner');
  if (microsoftOwners.size) throw new Error('Missing maintained Microsoft package registration owner');
  for (const file of await filesUnder(path.join(appRoot, 'server'))) await checkedApplicationSource(file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('Registration bypass check accepts no arguments.');
    await checkRegistrationBypasses();
    process.stdout.write('Application registration owners verified.\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
