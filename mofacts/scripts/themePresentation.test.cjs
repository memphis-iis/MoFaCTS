// Central presentation contracts: no Meteor, database, browser account or provider.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = require('css-tree');

const app = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(app, file), 'utf8');
const classic = read('public/styles/classic.css');
const instruction = read('public/styles/instructional-content.css');
const components = ['SparcNode', 'SparcSessionSurface', 'SparcPromptFigure', 'SparcFigure', 'SparcAutoTutorProgress', 'SparcWorksheetSurface'];

describe('central application presentation', () => {
  it('uses the learner renderer for library text and one figure presenter for learner and library images', () => {
    for (const name of ['SparcLibraryComponent', 'SparcLibraryComponentPreview']) {
      const source = read(`client/views/experimentSetup/sparc/${name}.svelte`);
      assert.match(source, /<SparcNode node=\{previewNode\}/);
      assert.doesNotMatch(source, /renderSparcInstructionMarkdown|\{@html|:global\((?:table|th|td)\)/);
    }
    const thumbnail = read('client/views/experimentSetup/sparc/SparcLibraryComponentPreview.svelte');
    assert.doesNotMatch(thumbnail, /\.slice\(0, 600\)|font-size:/, 'Clipping must not change or restyle the source content');
    for (const file of ['client/views/experiment/svelte/components/SparcPromptFigure.svelte', 'client/views/experimentSetup/sparc/SparcLibraryRaster.svelte']) {
      const source = read(file);
      assert.match(source, /<SparcFigure /);
      assert.doesNotMatch(source, /<img\b|<style\b/);
    }
  });
  it('loads the presentation once through the application shell, with no renderer-owned stylesheet', () => {
    const shell = read('client/index.html');
    assert.equal((shell.match(/href="\/styles\/instructional-content.css"/g) || []).length, 1);
    for (const name of components) {
      const source = read(`client/views/experiment/svelte/components/${name}.svelte`);
      assert.doesNotMatch(source, /<style\b|import\s+['"][^'"]+\.css/);
    }
  });

  it('keeps ordinary and generated tables in the same central density, color and radius contract', () => {
    assert.match(classic, /table,\s*\.table\s*\{/);
    assert.match(classic, /padding: var\(--app-space-2\) var\(--app-space-3\)/);
    assert.match(classic, /border-radius: var\(--app-border-radius-sm\)/);
    assert.match(classic, /background-color: var\(--app-secondary-surface-color\)/);
    assert.match(classic, /color: var\(--app-secondary-text-color\)/);
    assert.doesNotMatch(instruction, /\.sparc-(?:html-block|instruction-content)\s+(?:table|th|td)\s*\{/);
    assert.equal(/\.table-responsive\s+table\s*\{[^}]*min-width:/.test(classic), false, 'Responsive tables must not force a fixed minimum width');
  });

  it('parses both stylesheets and resolves every instructional theme variable from central definitions', () => {
    const definitions = new Set();
    for (const source of [classic, instruction]) {
      const ast = css.parse(source, { positions: true });
      css.walk(ast, { visit: 'Declaration', enter(node) {
        if (node.property.startsWith('--')) definitions.add(node.property);
      } });
    }
    for (const [, variable] of instruction.matchAll(/var\((--[\w-]+)/g)) {
      assert.ok(definitions.has(variable), `Missing central definition: ${variable}`);
    }
    assert.equal(/var\(--sparc-|var\(--primary-color|var\(--warning-color|#[0-9a-f]{3,8}\b|:\s*(?:black|white)\s*[;)]/i.test(instruction), false, 'Presentation must use central theme properties');
    assert.match(instruction, /\.sparc-prompt-figure img\s*\{[^}]*border-radius: var\(--app-border-radius-sm\)/);
    assert.match(instruction, /box-shadow: var\(--app-shadow-floating-panel\)/);
    assert.match(instruction, /prefers-reduced-motion: reduce/);
  });

  it('keeps text legible on the table and reading surfaces in exactly Default and Dark Industrial', () => {
    const luminance = hex => {
      const values = hex.replace('#', '').match(/../g).map(value => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    for (const id of ['mofacts-default', 'dark-industrial']) {
      const { properties } = JSON.parse(read(`public/themes/${id}.json`));
      for (const [foreground, background] of [
        ['app_secondary_text_color', 'app_secondary_surface_color'],
        ['app_text_color', 'learning_card_surface_color'],
        ['app_text_color', 'learning_card_stimulus_surface_color'],
      ]) {
        const values = [luminance(properties[foreground]), luminance(properties[background])].sort((a, b) => b - a);
        assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${id}: ${foreground} on ${background}`);
      }
    }
  });
});
