// Source-level contrast coverage; rendered review remains a separate requirement.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = require('css-tree');

const app = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(app, file), 'utf8');
const classic = read('public/styles/classic.css');
const rules = new Map();
css.walk(css.parse(classic), { visit: 'Rule', enter(node) {
  if (node.prelude?.type !== 'SelectorList') return;
  const declarations = {};
  node.block.children.forEach(item => {
    if (item.type === 'Declaration') declarations[item.property] = css.generate(item.value).trim();
  });
  node.prelude.children.forEach(selector => {
    const key = css.generate(selector);
    rules.set(key, { ...rules.get(key), ...declarations });
  });
} });

function rule(selector) {
  const key = css.generate(css.parse(selector, { context: 'selector' }));
  assert.ok(rules.has(key), `Missing shared rule: ${selector}`);
  return rules.get(key);
}

function splitTopLevel(value, separator) {
  let depth = 0;
  let start = 0;
  const parts = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (depth === 0 && separator.test(value[i])) {
      if (i > start) parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < value.length) parts.push(value.slice(start).trim());
  return parts;
}

function arithmetic(expression) {
  const tokens = expression.replace(/calc/g, '').replace(/%/g, '').match(/\d+(?:\.\d+)?|[()+*/-]/g) || [];
  let index = 0;
  const atom = () => {
    if (tokens[index] === '(') {
      index++;
      const value = sum();
      assert.equal(tokens[index++], ')');
      return value;
    }
    const value = Number(tokens[index++]);
    assert.ok(Number.isFinite(value), `Invalid numeric CSS: ${expression}`);
    return value;
  };
  const product = () => {
    let value = atom();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = atom();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = product();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  assert.equal(index, tokens.length, `Unconsumed numeric CSS: ${expression}`);
  return result;
}

function createThemeColorResolver(properties) {
  const variables = { ...rule(':root') };
  for (const [key, value] of Object.entries(properties)) variables[`--${key.replaceAll('_', '-')}`] = String(value);
  function expand(value, depth = 0) {
    assert.ok(depth < 40, `Cyclic theme variable: ${value}`);
    return value.replace(/var\((--[\w-]+)(?:,([^()]+))?\)/g, (_match, key, defaultValue) => {
      assert.ok(key in variables || defaultValue !== undefined, `Undefined theme variable: ${key}`);
      return expand(variables[key] ?? defaultValue.trim(), depth + 1);
    });
  }
  function parseColor(value) {
    const input = expand(value).trim();
    if (/^#[\da-f]{6}$/i.test(input)) return [...input.slice(1).match(/../g).map(v => parseInt(v, 16)), 1];
    if (/^#[\da-f]{3}$/i.test(input)) return [...input.slice(1).split('').map(v => parseInt(v + v, 16)), 1];
    if (input === 'transparent') return [0, 0, 0, 0];
    assert.ok(input.startsWith('color-mix('), `Unsupported bundled color syntax: ${input}`);
    const [space, first, second] = splitTopLevel(input.slice(10, -1), /,/);
    assert.equal(space, 'in srgb');
    const term = text => {
      const [color, weight] = splitTopLevel(text, /\s/);
      return { color: parseColor(color), weight: weight ? arithmetic(weight) / 100 : null };
    };
    const a = term(first);
    const b = term(second);
    const aw = a.weight ?? (b.weight === null ? 0.5 : 1 - b.weight);
    const bw = b.weight ?? (1 - aw);
    const alpha = a.color[3] * aw + b.color[3] * bw;
    return [...[0, 1, 2].map(i => alpha ? (a.color[i] * a.color[3] * aw + b.color[i] * b.color[3] * bw) / alpha : 0), alpha];
  }
  return parseColor;
}

function composite(foreground, background) {
  return [...foreground.slice(0, 3).map((value, i) => value * foreground[3] + background[i] * (1 - foreground[3])), 1];
}

function luminance(color) {
  const channels = color.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels.reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(foreground, background) {
  const a = luminance(composite(foreground, background));
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function assertThemeContrast(theme) {
  const color = createThemeColorResolver(theme.properties);
  const check = (foreground, background, minimum = 4.5) => {
    const ratio = contrast(color(foreground), color(background));
    assert.ok(ratio >= minimum, `${theme.themeName}: ${foreground} on ${background} = ${ratio.toFixed(3)}:1; requires ${minimum}:1`);
    return ratio;
  };
  const surfaces = ['--app-background-color', '--learning-card-surface-color', '--learning-card-stimulus-surface-color', '--app-secondary-surface-color', '--app-subtle-surface-color', '--app-state-selected-surface-color', '--app-state-success-surface-color', '--app-state-error-surface-color', '--app-state-warning-surface-color'];
  for (const foreground of ['--app-text-color', '--app-accent-color', '--feedback-correct-color', '--feedback-error-color', '--app-warning-color']) {
    for (const background of surfaces) check(`var(${foreground})`, `var(${background})`);
  }
  check('var(--app-secondary-text-color)', 'var(--app-secondary-surface-color)');
  check('var(--navigation-text-color)', 'var(--navigation-surface-color)');
  check('var(--learning-card-primary-action-text-color)', 'var(--learning-card-primary-action-surface-color)');
  check('var(--learning-card-audio-control-color)', 'var(--learning-card-surface-color)', 3);
  check('var(--app-on-semantic-color)', 'var(--app-accent-color)', 3);
  assert.match(rule('.form-switch .form-check-input:checked')['background-image'], /var\(--app-on-semantic-color\)/);
  assert.match(rule('.form-switch .form-check-input')['background-image'], /var\(--app-secondary-text-color\)/);
  check('var(--practice-menu-accuracy-bar-fill-color)', 'var(--app-background-color)', 3);
  const track = composite(color('var(--practice-menu-accuracy-bar-track-color)'), color('var(--app-background-color)'));
  assert.ok(contrast(color('var(--practice-menu-accuracy-bar-fill-color)'), track) >= 3, `${theme.themeName}: accuracy fill against track`);
  for (const kind of ['primary', 'secondary', 'success', 'warning', 'danger', 'outline-secondary', 'outline-danger']) {
    const style = { ...rule('.btn'), ...rule(`body .btn-${kind}`) };
    if (style['background-color'] !== 'transparent') check(style.color, style['background-color']);
    check(style['--bs-btn-hover-color'], style['--bs-btn-hover-bg']);
    const hover = rule(`.btn-${kind}:hover`);
    check(hover.color, hover['background-color']);
    for (const [active, hover] of [['--bs-btn-active-color', '--bs-btn-hover-color'], ['--bs-btn-active-bg', '--bs-btn-hover-bg']]) {
      assert.equal(style[active], `var(${hover})`, `${kind}: pressed state must retain its theme pair`);
    }
  }
  for (const selector of [".c-card-choices__button:is([aria-checked='true'], .is-selected)", 'body .btn-selected', '.c-card-choices__button:hover', '.c-card-choices__button:focus-visible']) {
    const style = rule(selector);
    check(style.color, style['background-color']);
  }
  return { theme: theme.themeName, semanticCardRatios: ['--app-accent-color', '--feedback-correct-color', '--feedback-error-color', '--app-warning-color'].map(key => check(`var(${key})`, 'var(--learning-card-surface-color)')) };
}

module.exports = { createThemeColorResolver, contrast, assertThemeContrast };

if (require.main === module) describe('bundled application theme contrast', () => {
  const directory = path.join(app, 'public/themes');
  for (const filename of fs.readdirSync(directory).filter(file => file.endsWith('.json'))) {
    const theme = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    it(`${theme.themeName}: reading surfaces, semantic fills, and normal/hover/pressed controls`, () => assertThemeContrast(theme));
  }
  it('keeps initial CSS defaults and server defaults aligned with the bundled Default source', () => {
    const theme = JSON.parse(read('public/themes/mofacts-default.json'));
    const root = rule(':root');
    const initialColor = createThemeColorResolver({});
    const defaultColor = createThemeColorResolver(theme.properties);
    for (const [key, value] of Object.entries(theme.properties)) {
      const name = `--${key.replaceAll('_', '-')}`;
      if (!(name in root)) continue;
      if (key.endsWith('_color')) {
        assert.deepEqual(initialColor(`var(${name})`), defaultColor(String(value)), key);
      } else {
        assert.equal(css.generate(css.parse(root[name], { context: 'value' })).toLowerCase(), css.generate(css.parse(String(value), { context: 'value' })).toLowerCase(), key);
      }
    }
    const registry = read('server/lib/themeRegistry.ts');
    assert.match(registry, /import defaultTheme from '..\/..\/public\/themes\/mofacts-default\.json'/);
    assert.match(registry, /\.\.\.defaultTheme\.properties/);
    assert.doesNotMatch(registry, /(?:app_accent_color|feedback_correct_color|feedback_error_color):\s*['"]#/);
    assert.equal(root['--app-on-semantic-color'], 'var(--learning-card-surface-color)');
  });
  it('uses the inverse semantic label for every affected filled consumer', () => {
    const files = [
      'client/views/home/home.css', 'client/views/profile/profile.css', 'client/views/home/learningDashboard.css',
      'client/views/home/profileAudioToggles.css', 'client/views/home/profileDebugToggles.css',
      'client/views/experimentSetup/apkgWizard.css', 'client/views/experimentSetup/imsccWizard.css',
      'client/views/experimentSetup/manualContentCreator.css', 'client/views/experimentSetup/tdfEdit.css',
      'client/views/shared/adminUi/adminUi.css',
    ];
    for (const file of files) {
      const source = read(file);
      assert.match(source, /color:\s*var\(--app-on-semantic-color\)/, file);
      css.walk(css.parse(source), { visit: 'Rule', enter(node) {
        const declarations = {};
        node.block.children.forEach(item => {
          if (item.type === 'Declaration') declarations[item.property] = css.generate(item.value).trim();
        });
        const background = declarations.background || declarations['background-color'] || '';
        if (/^var\(--(?:app-accent-color|app-(?:state-)?(?:success|warning|error|info)-color|app-media-(?:image|mixed|audio)-color)\)$/.test(background) && declarations.color) {
          assert.equal(declarations.color, 'var(--app-on-semantic-color)', `${file}: ${css.generate(node.prelude)}`);
        }
      } });
    }
  });
});
