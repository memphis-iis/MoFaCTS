import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

const MANAGEMENT_TEMPLATES = [
  'contentUpload',
  'aiContentCreator',
  'manualContentCreator',
  'contentEdit',
  'tdfEdit',
  'dataDownload',
  'profile',
  'audioSettings',
  'classSelection',
  'help',
  'adminControls',
  'adminBackups',
  'userAdmin',
  'turkWorkflow',
  'theme',
  'testRunner',
  'classEdit',
  'courses',
  'tdfAssignmentEdit',
  'instructorReporting',
] as const;

const MANAGEMENT_ROUTE_PATHS: Readonly<Record<string, string>> = {
  contentUpload: '/contentUpload',
  aiContentCreator: '/aiContentCreate',
  manualContentCreator: '/contentCreate',
  contentEdit: '/contentEdit/:tdfId',
  tdfEdit: '/tdfEdit/:tdfId',
  dataDownload: '/dataDownload',
  profile: '/profile',
  audioSettings: '/audioSettings',
  classSelection: '/classSelection',
  help: '/help',
  adminControls: '/adminControls',
  adminBackups: '/admin/backups',
  userAdmin: '/userAdmin',
  turkWorkflow: '/turkWorkflow',
  theme: '/theme',
  testRunner: '/admin/tests',
  classEdit: '/classEdit',
  courses: '/courses',
  tdfAssignmentEdit: '/tdfAssignmentEdit',
  instructorReporting: '/instructorReporting',
};

function findAppRoot(): string {
  const candidates = [process.env.INIT_CWD, process.env.PWD, process.cwd()]
    .filter((candidate): candidate is string => Boolean(candidate))
    .flatMap((candidate) => [candidate, path.join(candidate, 'mofacts')]);
  const appRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'client', 'lib', 'router.ts'))
  );
  if (!appRoot) {
    throw new Error(`Could not locate the MoFaCTS app source root from: ${candidates.join(', ')}`);
  }
  return appRoot;
}

function sourceBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) {
    throw new Error(`Missing source block start: ${start}`);
  }
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0) {
    throw new Error(`Missing source block end after ${start}: ${end}`);
  }
  return source.slice(startIndex, endIndex + end.length);
}

describe('management interface baseline', function() {
  it('keeps management metadata in one canonical policy module', function() {
    const appRoot = findAppRoot();
    const indexSource = fs.readFileSync(path.join(appRoot, 'client', 'index.ts'), 'utf8');
    const routerSource = fs.readFileSync(path.join(appRoot, 'client', 'lib', 'router.ts'), 'utf8');
    const policySource = fs.readFileSync(
      path.join(appRoot, 'client', 'lib', 'adminUi', 'managementRoutePresentationPolicies.ts'),
      'utf8',
    );

    for (const template of MANAGEMENT_TEMPLATES) {
      expect(policySource, `canonical policy for ${template}`).to.include(`template: '${template}'`);
    }
    expect(indexSource).not.to.include('APP_SHELL_TEMPLATES');
    expect(indexSource).not.to.include('APP_SHELL_TITLE_KEYS');
    expect(routerSource).not.to.match(
      /^\s{2}(?:contentUpload|profile|adminControls): \(\) => import\(/m,
    );
  });

  it('characterizes current public management route paths', function() {
    const routerSource = fs.readFileSync(
      path.join(findAppRoot(), 'client', 'lib', 'router.ts'),
      'utf8',
    );
    const restrictedBlock = sourceBlock(routerSource, 'const restrictedRoutes', '];');

    for (const [template, routePath] of Object.entries(MANAGEMENT_ROUTE_PATHS)) {
      const isGeneratedRestrictedRoute = ['userAdmin', 'tdfAssignmentEdit', 'instructorReporting']
        .includes(template);
      if (isGeneratedRestrictedRoute) {
        expect(restrictedBlock, `generated route for ${template}`).to.include(`'${template}'`);
      } else {
        expect(routerSource, `route path for ${template}`).to.include(
          `FlowRouter.route('${routePath}',`,
        );
      }
    }
  });

  it('keeps one shell-owned page heading in the authenticated layout', function() {
    const indexMarkup = fs.readFileSync(
      path.join(findAppRoot(), 'client', 'index.html'),
      'utf8',
    );
    const shellMarkup = sourceBlock(indexMarkup, '<template name="DefaultLayout">', '</template>');

    expect(shellMarkup.match(/<h1\b/g) ?? []).to.have.length(1);
  });

  it('keeps the 25rem feedback limit scoped to table feedback', function() {
    const appRoot = findAppRoot();
    const sharedMarkup = fs.readFileSync(
      path.join(appRoot, 'client', 'views', 'shared', 'adminUi', 'adminUi.html'),
      'utf8',
    );
    const sharedStyles = fs.readFileSync(
      path.join(appRoot, 'client', 'views', 'shared', 'adminUi', 'adminUi.css'),
      'utf8',
    );
    const inlineFeedback = sourceBlock(sharedStyles, '.admin-inline-feedback {', '}');
    const inlineConfirmation = sourceBlock(sharedStyles, '.admin-inline-confirmation {', '}');
    const tableFeedback = sourceBlock(sharedStyles, '.admin-table-feedback {', '}');

    expect(sharedMarkup).to.include('{{statusIdAttrs}}');
    expect(sharedMarkup).to.include('{{statusClassName}}');
    expect(sharedMarkup).to.include('aria-atomic="true"');
    expect(inlineFeedback).to.include('max-inline-size: 100%');
    expect(inlineFeedback).not.to.include('25rem');
    expect(inlineConfirmation).to.include('max-inline-size: 100%');
    expect(inlineConfirmation).not.to.include('25rem');
    expect(tableFeedback).to.include('max-inline-size: min(100%, 25rem)');
    expect(tableFeedback).to.include('overflow-wrap: anywhere');
  });

  it('registers APKG step presentation functions as Blaze helpers', function() {
    const apkgSource = fs.readFileSync(
      path.join(findAppRoot(), 'client', 'views', 'experimentSetup', 'apkgWizard.ts'),
      'utf8',
    );
    const helperBlock = sourceBlock(
      apkgSource,
      'Template.apkgWizard.helpers({',
      '// Event handlers',
    );
    const eventBlock = sourceBlock(
      apkgSource,
      'Template.apkgWizard.events({',
      '// Helper function to validate a config',
    );

    expect(helperBlock).to.include('stepWizardMessage(step: number)');
    expect(helperBlock).to.include('stepInlineConfirmation(step: number)');
    expect(eventBlock).not.to.include('stepWizardMessage(step: number)');
    expect(eventBlock).not.to.include('stepInlineConfirmation(step: number)');
  });
});
