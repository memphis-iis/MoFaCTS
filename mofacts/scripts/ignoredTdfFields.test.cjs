// Exercise the actual bundled editor and pure contracts without starting Meteor.
require('./registerHistoryTypescript.cjs');
const { describe, it, beforeEach, afterEach } = require('node:test');
Object.assign(global, { describe, it, beforeEach, afterEach });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createTdfSchemaFromRegistry } = require('../common/fieldRegistrySections.ts');
const { UNIT_FIELD_REGISTRY, UNIT_DIRECT_RUNTIME_KEYS } = require('../common/tdfFieldRegistries.ts');
const { createTooltipMapForRegistry, createRuntimeDefaults } = require('../common/fieldRegistrySectionCore.ts');
const { removeEmptyEditorProperties, mergeEditorContentPreservingSourceShape } = require('../common/lib/editorSaveShape.ts');
const { configureIgnoredJsonEditorFields } = require('../client/lib/ignoredJsonEditorFields.ts');
const { prepareTutorSchemaForJsonEditor } = require('../client/views/experimentSetup/tdfDraftSchema.ts');
const { installSchemaApplicabilityControls } = require('../client/lib/schemaApplicabilityEditor.ts');
const { validateTdfExpressions } = require('../common/lib/tdfExpressionValidation.ts');
const { TDF_CONTENT_SCHEMA } = require('../common/lib/tdfContentSchema.ts');
const { assertNoH5PContent } = require('../common/lib/unsupportedContent.ts');

const fields = ['turkemail', 'turkemailsubject', 'turkbonus'];
const values = ['old message', 1.5, null, ['', null, { old: true }], { old: ['', null] }, '', {}, []];
const bundle = fs.readFileSync(path.join(__dirname, '../public/vendor/json-editor/2.15.2/dist/jsoneditor.min.js'), 'utf8');

describe('ignored TDF metadata', () => {
  it('excludes ignored fields from runtime lists, defaults and tooltips', () => {
    const tooltips = createTooltipMapForRegistry(UNIT_FIELD_REGISTRY, ['unit[]']);
    const defaults = createRuntimeDefaults(UNIT_FIELD_REGISTRY);
    for (const key of fields) {
      assert.equal(UNIT_FIELD_REGISTRY[key].lifecycle.status, 'ignored');
      assert.equal(UNIT_DIRECT_RUNTIME_KEYS.includes(key), false);
      assert.equal(Object.hasOwn(defaults, key), false);
      assert.equal(Object.hasOwn(tooltips, `unit[].${key}`), false);
    }
  });

  it('does not interpret expression or unsupported-content names inside ignored payloads', () => {
    const payload = { h5p: {}, adaptiveLogic: 17, calculateProbability: { invalid: true } };
    const unit = Object.fromEntries(fields.map(key => [key, payload]));
    for (const content of [
      { tutor: { unit: [unit], setspec: { unitTemplate: [unit] } } },
      { tdfs: { tutor: { unit: [unit], setspec: { unitTemplate: [unit] } } } },
    ]) {
      const original = JSON.stringify(content);
      assert.equal(validateTdfExpressions(content).valid, true);
      assert.equal(validateTdfExpressions(content).expressionCount, 0);
      assert.doesNotThrow(() => assertNoH5PContent(content, TDF_CONTENT_SCHEMA));
      assert.equal(JSON.stringify(content), original);
    }
    assert.equal(validateTdfExpressions({ tutor: { unit: [{ adaptiveLogic: 17 }] } }).valid, false);
    assert.throws(() => assertNoH5PContent({ tutor: { unit: [{ h5p: {} }] } }, TDF_CONTENT_SCHEMA));
  });

  it('accepts any ignored value, hides its controls, and round-trips ordinary edits and reordering', async () => {
    const dom = new JSDOM('<main id="editor"></main>', { runScripts: 'outside-only', pretendToBeVisual: true });
    dom.window.eval(bundle);
    const JSONEditor = dom.window.JSONEditor;
    JSONEditor.defaults.options.disable_theme_rules = true;
    configureIgnoredJsonEditorFields(JSONEditor);
    configureIgnoredJsonEditorFields(JSONEditor); // configuration is safe on repeated loader calls
    const tutorSchema = prepareTutorSchemaForJsonEditor(createTdfSchemaFromRegistry().properties.tutor);
    const units = [...values, { h5p: {}, adaptiveLogic: 17 }].map((value, index) => ({
      unitinstructions: `unit ${index}`, ...Object.fromEntries(fields.map(key => [key, value])),
    }));
    const original = { setspec: { lessonname: 'Synthetic', stimulusfile: 'synthetic.json', prolificCompletionUrl: 'https://app.prolific.com/submissions/complete?cc=ABC123', unitTemplate: units }, unit: units };
    const initial = removeEmptyEditorProperties(original, tutorSchema);
    assert.deepEqual(initial, original);
    const container = dom.window.document.getElementById('editor');
    const editor = new JSONEditor(container, {
      schema: tutorSchema, startval: initial, no_additional_properties: true,
      remove_empty_properties: true, required_by_default: false, show_opt_in: false,
    });
    try {
      await new Promise(resolve => editor.on('ready', resolve));
      assert.deepEqual(JSON.parse(JSON.stringify(editor.getValue())), original);
      assert.equal(editor.validate().length, 0);
      const completionControl = editor.getEditor('root.setspec.prolificCompletionUrl');
      assert.ok(completionControl.container.querySelector('input'));
      assert.equal(completionControl.getValue(), original.setspec.prolificCompletionUrl);
      for (const scope of ['root.unit', 'root.setspec.unitTemplate']) {
        for (let index = 0; index < values.length; index++) {
          for (const key of fields) {
            const field = editor.getEditor(`${scope}.${index}.${key}`);
            assert.equal(field.container.hidden, true);
            assert.equal(field.container.querySelector('input,textarea,select,button'), null);
          }
        }
      }
      const edited = JSON.parse(JSON.stringify(original));
      edited.unit.reverse();
      edited.unit[0].unitinstructions = 'Edited';
      editor.setValue(edited);
      assert.deepEqual(JSON.parse(JSON.stringify(editor.getValue())), edited);
      const saveSchema = { properties: { tdfs: createTdfSchemaFromRegistry() } };
      const saved = mergeEditorContentPreservingSourceShape(
        { tdfs: { tutor: original } }, { tdfs: { tutor: editor.getValue() } }, saveSchema);
      assert.deepEqual(JSON.parse(JSON.stringify(saved.tdfs.tutor)), edited);
      const inserted = JSON.parse(JSON.stringify(edited));
      inserted.unit.unshift({ unitinstructions: 'New unit' });
      editor.setValue(inserted);
      const savedWithNewUnit = mergeEditorContentPreservingSourceShape(
        { tdfs: { tutor: original } }, { tdfs: { tutor: editor.getValue() } }, saveSchema);
      assert.deepEqual(JSON.parse(JSON.stringify(savedWithNewUnit.tdfs.tutor)), inserted);
      // The property picker also excludes fields marked x-editor=false.
      const previousElement = global.Element;
      global.Element = dom.window.Element;
      const controls = installSchemaApplicabilityControls(container, editor);
      try {
        const unit = editor.getEditor('root.unit.0');
        unit.container.querySelector('.json-editor-btntype-properties').click();
        controls.sync();
        const picker = unit.container.querySelector('.je-modal');
        assert.ok(picker);
        for (const key of fields) assert.equal(picker.querySelector(`input[value="${key}"]`), null);
      } finally {
        controls.destroy();
        global.Element = previousElement;
      }
      const invalid = JSON.parse(JSON.stringify(edited));
      invalid.unit[0].unsupportedField = true;
      assert.ok(editor.validate(invalid).some(error => error.property === 'additionalProperties'));
    } finally {
      editor.destroy();
      dom.window.close();
    }
  });
});

require('../common/lib/editorSaveShape.test.ts');
require('../common/fieldRegistrySections.test.ts');
require('../common/safeExpressionEngine.test.ts');
require('../common/lib/unsupportedContent.test.ts');
require('../client/lib/adminUi/managementRoutePresentationPolicies.test.ts');
require('../client/lib/prolificExperimentEntry.test.ts');
require('../client/views/experiment/instructionContinuePolicy.test.ts');
