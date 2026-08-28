import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_THEME_ALIASES: Readonly<Record<string, string>> = {
  '--public-page-surface': '--app-background-color',
  '--public-alt-surface': '--app-secondary-surface-color',
  '--public-card-surface': '--learning-card-surface-color',
  '--public-copy': '--app-text-color',
  '--public-muted': '--app-secondary-text-color',
  '--public-border': '--border-color',
  '--public-action': '--app-primary-action-surface-color',
  '--public-action-text': '--app-primary-action-text-color',
  '--public-decoration': '--app-accent-color',
};

const RETIRED_PUBLIC_THEME_PROPERTIES = [
  'public_page_surface_color',
  'public_alt_surface_color',
  'public_card_surface_color',
  'public_text_color',
  'public_muted_text_color',
  'public_border_color',
  'public_primary_action_surface_color',
  'public_primary_action_text_color',
  'public_hero_decoration_color',
] as const;

function findAppRoot(): string {
  const candidates = [process.env.INIT_CWD, process.env.PWD, process.cwd()]
    .filter((candidate): candidate is string => Boolean(candidate))
    .flatMap((candidate) => [candidate, path.join(candidate, 'mofacts')]);
  const appRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'client', 'views', 'publicExperience', 'publicExperience.css'))
  );
  if (!appRoot) {
    throw new Error(`Could not locate the MoFaCTS app source root from: ${candidates.join(', ')}`);
  }
  return appRoot;
}

function cssRuleBody(source: string, selector: string): string {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const ruleStart = normalizedSource.indexOf(`${selector} {`);
  if (ruleStart < 0) {
    throw new Error(`Missing CSS rule: ${selector}`);
  }
  const bodyStart = normalizedSource.indexOf('{', ruleStart) + 1;
  const bodyEnd = normalizedSource.indexOf('\n}', bodyStart);
  if (bodyEnd < 0) {
    throw new Error(`Missing closing brace for CSS rule: ${selector}`);
  }
  return normalizedSource.slice(bodyStart, bodyEnd);
}

describe('public experience theme contract', function() {
  it('uses the active application theme without rebasing it onto another palette', function() {
    const appRoot = findAppRoot();
    const stylesheet = fs.readFileSync(
      path.join(appRoot, 'client', 'views', 'publicExperience', 'publicExperience.css'),
      'utf8',
    );
    const contextRule = cssRuleBody(stylesheet, '.public-theme-context');

    for (const [alias, applicationRole] of Object.entries(PUBLIC_THEME_ALIASES)) {
      expect(contextRule, alias).to.include(`${alias}: var(${applicationRole});`);
    }
    expect(contextRule).not.to.match(/--app-[a-z0-9-]+\s*:\s*var\(--public-/i);
  });

  it('does not keep a second public palette in source theme definitions', function() {
    const appRoot = findAppRoot();
    const sourcePaths = [
      path.join('common', 'themeRoleSchema.ts'),
      path.join('client', 'lib', 'themeGenerator.ts'),
      path.join('client', 'views', 'theme.html'),
      path.join('server', 'lib', 'themeRegistry.ts'),
      path.join('public', 'themes', 'mofacts-default.json'),
      path.join('public', 'themes', 'dark-industrial.json'),
      path.join('public', 'themes', 'whimsical-refined.json'),
    ];

    for (const sourcePath of sourcePaths) {
      const source = fs.readFileSync(path.join(appRoot, sourcePath), 'utf8');
      for (const property of RETIRED_PUBLIC_THEME_PROPERTIES) {
        expect(source, `${sourcePath}: ${property}`).not.to.include(property);
      }
    }
  });
});
