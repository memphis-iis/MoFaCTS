// Exercise the real registry with an in-memory settings collection: no Meteor
// process, database, accounts, or saved theme documents are touched.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

const app = path.resolve(__dirname, '..');
const readTheme = name => JSON.parse(fs.readFileSync(path.join(app, 'public/themes', name), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const withoutLoadTimestamps = themes => themes.map(theme => ({
  ...theme,
  metadata: Object.fromEntries(Object.entries(theme.metadata).filter(([key]) => !['createdAt', 'updatedAt'].includes(key))),
}));

function createRegistry(initialSettings = []) {
  const settings = new Map(initialSettings.map(document => [document.key, clone(document)]));
  const writes = [];
  const collection = {
    async findOneAsync({ key }) { return settings.has(key) ? clone(settings.get(key)) : undefined; },
    async upsertAsync({ key }, { $set }) {
      settings.set(key, { key, ...clone($set) });
      writes.push(key);
    },
  };
  const cache = new Map();
  function loadTypescript(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const module = { exports: {} };
    cache.set(filename, module.exports);
    const localRequire = createRequire(filename);
    const requireForRegistry = id => {
      if (id === 'meteor/meteor') return { Meteor: { Error: class extends Error {} } };
      if (id === '../../common/Collections') return { DynamicSettings: collection };
      if (id === '../../common/themePropertyNormalization') {
        return loadTypescript(path.join(app, 'common/themePropertyNormalization.ts'));
      }
      return localRequire(id);
    };
    new Function('require', 'module', 'exports', compiled)(requireForRegistry, module, module.exports);
    cache.set(filename, module.exports);
    return module.exports;
  }
  const { themeRegistry } = loadTypescript(path.join(app, 'server/lib/themeRegistry.ts'));
  return { registry: themeRegistry, settings, writes };
}

describe('bundled theme ownership and defaults', () => {
  it('uses the bundled Default properties for server defaults', async () => {
    const { registry, settings } = createRegistry();
    await registry.initialize();
    const expected = readTheme('mofacts-default.json');
    const active = settings.get('customTheme').value;
    assert.equal(active.activeThemeId, expected.id);
    assert.deepEqual(active.properties, { ...expected.properties, app_density_scale: '1' });
    assert.equal(registry.getThemeEntry(expected.id).readOnly, true);
  });

  it('promotes the saved Imperial Dark identity once and preserves active selection across restart', async () => {
    const imperial = readTheme('imperial-dark.json');
    const savedImperial = clone(imperial);
    savedImperial.metadata.origin = 'custom';
    savedImperial.themeName = 'Old generated name';
    savedImperial.properties.themeName = 'Old generated name';
    savedImperial.properties.feedback_error_color = '#8C8E00';
    const personal = {
      ...clone(readTheme('mofacts-default.json')),
      id: 'personal-reading-theme',
      themeName: 'Personal reading theme',
      metadata: { name: 'Personal reading theme', origin: 'custom' },
    };
    personal.properties.themeName = personal.themeName;
    const { registry, settings } = createRegistry([
      { key: 'themeLibrary', value: [savedImperial, personal] },
      { key: 'customTheme', value: { ...savedImperial, activeThemeId: imperial.id } },
    ]);

    await registry.initialize();
    const promoted = registry.getThemeEntry(imperial.id);
    assert.equal(promoted.readOnly, true);
    assert.equal(promoted.data.metadata.origin, 'system');
    assert.equal(promoted.data.metadata.name, 'Imperial Dark');
    assert.equal(settings.get('customTheme').value.activeThemeId, imperial.id);
    assert.equal(settings.get('customTheme').value.properties.app_density_scale, '0.7');
    assert.equal(settings.get('customTheme').value.properties.app_font_size_base, '14px');
    assert.equal(settings.get('customTheme').value.properties.feedback_error_color, imperial.properties.feedback_error_color);
    assert.equal(registry.getThemeEntry(personal.id).readOnly, false);
    assert.equal(settings.get('themeLibrary').value.filter(theme => theme.id === imperial.id).length, 1);
    const afterPromotion = withoutLoadTimestamps(settings.get('themeLibrary').value);

    await registry.initialize();
    assert.deepEqual(withoutLoadTimestamps(settings.get('themeLibrary').value), afterPromotion);
    assert.equal(settings.get('customTheme').value.activeThemeId, imperial.id);
  });

  it('does not replace a different saved identity with the named promotion', async () => {
    const unexpected = clone(readTheme('imperial-dark.json'));
    unexpected.metadata = { name: 'Different custom theme', origin: 'custom' };
    const { registry, settings, writes } = createRegistry([{ key: 'themeLibrary', value: [unexpected] }]);
    await assert.rejects(registry.initialize(), /stored name does not match/);
    assert.deepEqual(writes, []);
    assert.equal(settings.get('themeLibrary').value[0].metadata.name, 'Different custom theme');
  });

  it('continues rejecting unrelated custom/system ID collisions', async () => {
    const conflicting = clone(readTheme('mofacts-default.json'));
    conflicting.metadata.origin = 'custom';
    const { registry, writes } = createRegistry([{ key: 'themeLibrary', value: [conflicting] }]);
    await assert.rejects(registry.initialize(), /Theme id collision/);
    assert.deepEqual(writes, []);
  });
});
