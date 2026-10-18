const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const createJiti = require('jiti');

const window = new JSDOM('').window;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;

const DOMPurify = require('dompurify');
const jiti = createJiti(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const {
  normalizeSparcRichHtml,
  sanitizeSparcRichHtml,
  validateSparcRichHtml,
} = jiti(path.join(repoRoot, 'mofacts/client/views/experiment/svelte/services/sparcRichHtml.ts'));

function assertSanitizerPreservesSupportedRichText() {
  const dirty = [
    '<h2 style="text-align: center">Centered</h2>',
    '<p><u>Under</u> <s>Strike</s> <mark>Mark</mark> H<sub>2</sub>O x<sup>2</sup></p>',
    '<p><span style="color: var(--sparc-accent-color)">Accent</span></p>',
    '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td colspan="2">C</td></tr></tbody></table>',
    '<figure class="oli-embed"><iframe src="https://www.youtube-nocookie.com/embed/J2KibEm5f04" title="youtube" width="100%" height="360" loading="lazy" allowfullscreen></iframe><figcaption>Video</figcaption></figure>',
    '<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" checked><span>Done</span></label></li></ul>',
  ].join('');

  const sanitized = sanitizeSparcRichHtml(dirty, DOMPurify.sanitize.bind(DOMPurify));

  assert.match(sanitized, /class="sparc-align-center"/);
  assert.match(sanitized, /data-align="center"/);
  assert.match(sanitized, /<u>Under<\/u>/);
  assert.match(sanitized, /<s>Strike<\/s>/);
  assert.match(sanitized, /<mark>Mark<\/mark>/);
  assert.match(sanitized, /<sub>2<\/sub>/);
  assert.match(sanitized, /<sup>2<\/sup>/);
  assert.match(sanitized, /class="sparc-color-accent"/);
  assert.match(sanitized, /data-color="accent"/);
  assert.match(sanitized, /<table>/);
  assert.match(sanitized, /colspan="2"/);
  assert.match(sanitized, /youtube-nocookie\.com\/embed\/J2KibEm5f04/);
  assert.match(sanitized, /data-type="taskList"/);
  assert.match(sanitized, /disabled="disabled"/);
  assert.deepEqual(validateSparcRichHtml(sanitized), []);
}

function assertSanitizerStripsUnsafeHtml() {
  const sanitized = sanitizeSparcRichHtml(
    '<p onclick="alert(1)" class="bad sparc-align-center" style="text-align: center">ok<script>alert(1)</script></p>',
    DOMPurify.sanitize.bind(DOMPurify),
  );

  assert.doesNotMatch(sanitized, /onclick/);
  assert.doesNotMatch(sanitized, /script/);
  assert.doesNotMatch(sanitized, /style=/);
  assert.doesNotMatch(sanitized, /class="bad/);
  assert.match(sanitized, /sparc-align-center/);
}

function assertValidationRejectsUnsafeEmbedsAndClasses() {
  assert.match(
    validateSparcRichHtml('<iframe src="http://example.test/embed"></iframe>').join('; '),
    /iframe src must be an https URL/,
  );
  assert.match(
    validateSparcRichHtml('<p class="unknown-class">x</p>').join('; '),
    /unsupported class "unknown-class"/,
  );
  assert.match(
    validateSparcRichHtml('<img src="https://example.test/image.png">').join('; '),
    /image requires alt text/,
  );
  assert.match(
    validateSparcRichHtml('<td colspan="0">bad</td>').join('; '),
    /table cell span values must be positive/,
  );
  assert.match(
    validateSparcRichHtml('<input type="text">').join('; '),
    /rich text inputs must be task-list checkboxes/,
  );
}

function assertNormalizationUsesClassDataRepresentation() {
  const normalized = normalizeSparcRichHtml('<p style="text-align: right"><span style="color: var(--sparc-error-color)">No</span></p>');

  assert.match(normalized, /class="sparc-align-right"/);
  assert.match(normalized, /data-align="right"/);
  assert.match(normalized, /class="sparc-color-error"/);
  assert.match(normalized, /data-color="error"/);
  assert.doesNotMatch(normalized, /style=/);
}

function assertTableSemanticsSurviveWithoutSharingRenderIds() {
  const authored = '<table><caption>Measurement comparison</caption>'
    + '<colgroup span="2"></colgroup><thead><tr><th id="measure" scope="col">Measure</th>'
    + '<th id="value" scope="col">Value</th></tr></thead>'
    + '<tbody><tr><th id="sample" scope="row">Sample A</th><td headers="sample value">12.5</td></tr></tbody></table>';
  const normalized = normalizeSparcRichHtml(authored);
  assert.deepEqual(validateSparcRichHtml(normalized), []);
  assert.match(normalized, /id="value"/);
  assert.match(normalized, /headers="sample value"/, 'Authoring normalization must not store render-specific IDs');
  const rendered = Array.from({ length: 3 }, () => sanitizeSparcRichHtml(normalized, DOMPurify.sanitize.bind(DOMPurify)));
  const container = window.document.createElement('div');
  container.innerHTML = rendered.join('');
  const allIds = [...container.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(new Set(allIds).size, allIds.length, 'Learner, thumbnail and expanded copies must not share header IDs');
  for (const table of container.querySelectorAll('table')) {
    assert.equal(table.firstElementChild.tagName, 'CAPTION');
    assert.equal(table.caption.textContent, 'Measurement comparison');
    assert.equal(table.querySelector('colgroup').span, 2);
    assert.deepEqual([...table.querySelectorAll('th')].map(header => header.scope), ['col', 'col', 'row']);
    const references = table.querySelector('td').headers.split(' ');
    assert.deepEqual(references.map(id => table.querySelector(`[id="${id}"]`).textContent), ['Sample A', 'Value']);
    assert.equal(table.querySelector('td').textContent, '12.5');
  }
  assert.equal(normalizeSparcRichHtml(normalized), normalized, 'Repeated authoring normalization preserves saved semantics');
}

function assertTableRelationshipsAreLocalAndUnambiguous() {
  const table = (content) => `<table><tr><th id="column">Column</th><td headers="column">${content}</td></tr></table>`;
  const nested = sanitizeSparcRichHtml(table(table('Nested value')), DOMPurify.sanitize.bind(DOMPurify));
  const container = window.document.createElement('div');
  container.innerHTML = nested;
  for (const cell of container.querySelectorAll('td[headers]')) {
    const target = container.querySelector(`[id="${cell.headers}"]`);
    assert.equal(target.closest('table'), cell.closest('table'), 'Nested tables keep independent header associations');
  }
  for (const invalid of [
    '<table><tr><th id="same">A</th><th id="same">B</th><td headers="same">1</td></tr></table>',
    '<table><tr><th id="other">A</th></tr></table><table><tr><td headers="other">1</td></tr></table>',
    '<table><tr><th scope="sideways">A</th><td>1</td></tr></table>',
    '<table><tr><th id="self" headers="self">A</th></tr></table>',
  ]) {
    assert.ok(validateSparcRichHtml(invalid).length > 0, 'Authoring must report invalid table associations');
    assert.throws(() => sanitizeSparcRichHtml(invalid, DOMPurify.sanitize.bind(DOMPurify)), /table\[0\]|table\[1\]/,
      'Rendering must not silently substitute a different header association');
  }
}

function assertTableSupportDoesNotExposeAuthoredAppIds() {
  const html = sanitizeSparcRichHtml('<p id="app" headers="outside" scope="col" onclick="bad()">Outside</p>'
    + '<table id="app-table"><tr><th id="location" scope="col" style="color:red">Heading</th>'
    + '<td id="app-cell" headers="location">Value<script>bad()</script></td></tr></table>', DOMPurify.sanitize.bind(DOMPurify));
  assert.doesNotMatch(html, /id="(?:app|app-table|app-cell|location)"|onclick=|style=|<script/);
  const container = window.document.createElement('div');
  container.innerHTML = html;
  assert.equal(container.querySelector('p').attributes.length, 0);
  assert.ok([...container.querySelectorAll('[id]')].every(element => element.tagName === 'TH'));
  assert.equal(container.querySelector('td').headers, container.querySelector('th').id);
}

function assertVisualEditorPreservesTableSemantics() {
  Object.assign(global, {
    Node: window.Node, MutationObserver: window.MutationObserver, getComputedStyle: window.getComputedStyle,
  });
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
  const { createSparcRichTextEditor } = jiti(path.join(repoRoot, 'mofacts/client/views/experimentSetup/sparc/sparcRichTextEditorBridge.js'));
  const host = window.document.createElement('div');
  window.document.body.appendChild(host);
  const authored = '<p>Introduction.</p><table><caption>Measurements <em>by sample</em></caption>'
    + '<colgroup span="1"></colgroup><colgroup span="2"></colgroup>'
    + '<thead><tr><th id="sample" scope="col">Sample</th><th id="measure" scope="colgroup" colspan="2">Measurements</th></tr></thead>'
    + '<tbody><tr><th id="first" scope="rowgroup">First group</th><td headers="first measure">12.5</td><td headers="first measure">13.5</td></tr></tbody>'
    + '<tbody><tr><th id="second" scope="rowgroup">Second group</th><td headers="second measure">14.5</td><td headers="second measure">15.5</td></tr></tbody>'
    + '<tfoot><tr><th scope="row">Total</th><td colspan="2">56</td></tr></tfoot></table><p>After.</p>';
  const editor = createSparcRichTextEditor({ element: host, content: authored,
    messages: { richTextPlaceholder: 'Instructional text' }, onUpdate() {}, onRevision() {}, onError(message) { throw new Error(message); } });
  try {
    assert.equal(host.querySelector('caption').innerHTML, 'Measurements <em>by sample</em>', 'Caption must remain visible in the visual editor');
    assert.equal(host.querySelector('caption').getAttribute('contenteditable'), 'false');
    const check = () => {
      const serialized = normalizeSparcRichHtml(editor.getHTML());
      assert.deepEqual(validateSparcRichHtml(serialized), []);
      const container = window.document.createElement('div');
      container.innerHTML = serialized;
      const table = container.querySelector('table');
      assert.equal(table.caption.innerHTML, 'Measurements <em>by sample</em>');
      assert.deepEqual([...table.querySelectorAll(':scope > colgroup')].map(group => group.span), [1, 2]);
      assert.equal(table.querySelectorAll(':scope > thead').length, 1);
      assert.equal(table.querySelectorAll(':scope > tbody').length, 2);
      assert.equal(table.querySelectorAll(':scope > tfoot').length, 1);
      assert.equal(table.querySelector('#measure').scope, 'colgroup');
      assert.equal(table.querySelector('#first').scope, 'rowgroup');
      assert.equal(table.querySelector('td').headers, 'first measure', 'Saving uses authored IDs, never render IDs');
      assert.doesNotMatch(serialized, /sparc-table-\d|columnGroups=|tableSection=|caption=/);
      return serialized;
    };
    const firstSave = check();
    editor.commands.setContent(firstSave, { emitUpdate: false });
    check();
    let measurementPosition;
    editor.state.doc.descendants((node, position) => { if (node.isText && node.text === '12.5') measurementPosition = position; });
    assert.equal(typeof measurementPosition, 'number');
    editor.commands.insertContentAt({ from: measurementPosition, to: measurementPosition + 4 }, '12.6');
    assert.match(check(), /12\.6/);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    assert.equal(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true }), true);
    assert.equal(editor.commands.addRowAfter(), true);
    assert.equal(editor.commands.addColumnAfter(), true);
    assert.equal(editor.commands.deleteColumn(), true);
    assert.equal(editor.commands.deleteRow(), true);
    check();
    assert.equal(host.querySelectorAll('caption').length, 1);
  } finally {
    editor.destroy();
    host.remove();
  }
}

function assertTableCommandsPreserveGroupsAndRejectBrokenReferences() {
  const { createSparcRichTextEditor, runVisualRichTextCommandOnElement, createSparcRichTextController } = jiti(path.join(repoRoot, 'mofacts/client/views/experimentSetup/sparc/sparcRichTextEditorBridge.js'));
  const { validateSparcDisplaysBeforeSave } = jiti(path.join(repoRoot, 'mofacts/client/views/experimentSetup/sparc/sparcAuthoringValidation.js'));
  const messages = { richTextPlaceholder: 'Instructional text' };
  const html = '<table><caption>Comparison</caption><colgroup span="1"></colgroup><colgroup span="2"></colgroup>'
    + '<thead><tr><th id="label" scope="col">Label</th><th id="values" scope="colgroup" colspan="2">Values</th></tr></thead>'
    + '<tbody><tr><th id="first" scope="rowgroup">First</th><td headers="first values">A</td><td headers="first values">B</td></tr></tbody>'
    + '<tbody><tr><th id="second" scope="rowgroup">Second</th><td headers="second values">C</td><td headers="second values">D</td></tr></tbody></table>';
  const host = document.createElement('div');
  document.body.appendChild(host);
  let error = '';
  let updates = 0;
  const editor = createSparcRichTextEditor({ element: host, content: html, messages,
    onUpdate() { updates++; }, onRevision() {}, onError(message) { error = message; } });
  const selectText = text => {
    let position;
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) position = pos; });
    assert.equal(typeof position, 'number');
    editor.commands.setTextSelection(position);
  };
  const serializedTable = () => {
    const container = document.createElement('div');
    container.innerHTML = normalizeSparcRichHtml(editor.getHTML());
    assert.deepEqual(validateSparcRichHtml(container.innerHTML), []);
    return container.querySelector('table');
  };
  const groups = () => [...serializedTable().querySelectorAll(':scope > colgroup')].map(group => group.span);
  try {
    selectText('A');
    editor.commands.addColumnAfter();
    assert.equal(error, '');
    assert.deepEqual(groups(), [1, 3]);
    assert.equal(serializedTable().querySelector('#values').colSpan, 3);
    assert.equal(serializedTable().querySelector('td').headers, 'first values');
    editor.commands.undo();
    assert.deepEqual(groups(), [1, 2]);
    editor.commands.redo();
    assert.deepEqual(groups(), [1, 3]);
    editor.commands.undo();
    selectText('Label');
    editor.commands.addColumnAfter();
    assert.deepEqual(groups(), [2, 2], 'Insertion at a boundary must expand the selected group, not shift old cells into it');
    editor.commands.undo();
    selectText('A');
    editor.commands.deleteColumn();
    assert.deepEqual(groups(), [1, 1]);
    assert.equal(serializedTable().querySelector('#values').colSpan, 1);
    editor.commands.undo();
    selectText('Values');
    editor.commands.addRowAfter();
    assert.equal(serializedTable().tHead.rows.length, 1, 'A new data row must not inherit the header section');
    assert.equal(serializedTable().tBodies[0].rows.length, 2);
    assert.ok([...serializedTable().tBodies[0].rows[0].cells].some(cell => cell.tagName === 'TD'));
    assert.equal(serializedTable().tBodies[1].querySelector('th').id, 'second');
    editor.commands.undo();
    selectText('A');
    editor.commands.addRowAfter();
    assert.equal(serializedTable().tBodies.length, 2);
    assert.equal(serializedTable().tBodies[0].rows.length, 2);
    editor.commands.undo();
    selectText('Values');
    const before = editor.getHTML();
    const beforeUpdates = updates;
    editor.commands.deleteRow();
    assert.match(error, /headers reference/);
    assert.equal(editor.getHTML(), before, 'Removing a referenced header must reject the whole transaction');
    assert.equal(updates, beforeUpdates, 'Rejected transactions must not publish an authoring update');
    error = '';
    editor.commands.splitCell();
    assert.match(error, /duplicate table header id/);
    assert.equal(editor.getHTML(), before, 'Splitting must not duplicate a header identity');
  } finally {
    editor.destroy();
    host.remove();
  }
  // The inline canvas table commands use the same grid and validation owner.
  const surface = document.createElement('div');
  surface.contentEditable = 'true';
  surface.innerHTML = '<p>Outside <em>meaning</em></p>' + html.replace('>A</td>', '><aside><p>Support <strong>exact</strong></p></aside></td>');
  document.body.appendChild(surface);
  const chooseCell = selector => {
    const range = document.createRange();
    range.selectNodeContents(surface.querySelector(selector));
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    return range;
  };
  try {
    let result = runVisualRichTextCommandOnElement({ element: surface, savedRange: chooseCell('td'),
      command: 'table-add-column', colors: [], messages });
    assert.equal(result.error, '');
    assert.deepEqual([...surface.querySelectorAll('colgroup')].map(group => group.span), [1, 3]);
    assert.equal(surface.querySelector('p').innerHTML, 'Outside <em>meaning</em>');
    assert.equal(surface.querySelector('td').innerHTML, '<aside><p>Support <strong>exact</strong></p></aside>',
      'Structural canvas edits must not normalize surviving cell content through the narrower visual editor schema');
    const before = surface.innerHTML;
    result = runVisualRichTextCommandOnElement({ element: surface, savedRange: chooseCell('#values'),
      command: 'table-delete-row', colors: [], messages });
    assert.match(result.error, /headers reference/);
    assert.equal(surface.innerHTML, before);
    result = runVisualRichTextCommandOnElement({ element: surface, savedRange: chooseCell('td'),
      command: 'table-add-row', colors: [], messages });
    assert.equal(result.error, '');
    assert.equal(surface.querySelector('td').innerHTML, '<aside><p>Support <strong>exact</strong></p></aside>');
    result = runVisualRichTextCommandOnElement({ element: surface, savedRange: chooseCell('tbody tr:first-child td:last-child'),
      command: 'table-delete-column', colors: [], messages });
    assert.equal(result.error, '');
    assert.deepEqual([...surface.querySelectorAll('colgroup')].map(group => group.span), [1, 2]);
    assert.equal(surface.querySelector('td').innerHTML, '<aside><p>Support <strong>exact</strong></p></aside>');
    result = runVisualRichTextCommandOnElement({ element: surface, savedRange: chooseCell('tbody tr:nth-child(2) td'),
      command: 'table-delete-row', colors: [], messages });
    assert.equal(result.error, '');
    assert.equal(surface.querySelectorAll('tbody')[0].rows.length, 1);
  } finally { surface.remove(); }
  // Invalid source remains visible as an unsaved draft. Existing save validation
  // rejects it, and stale visual editor state must never replace it silently.
  const draft = { id: 'table', nodeType: 'atomic', atomType: 'html-block', value: html };
  const controllerHost = document.createElement('div');
  let controllerError = '';
  const controller = createSparcRichTextController({
    colors: [], getActiveNode: () => draft, getActiveNodeId: () => draft.id,
    getHtmlEditorElement: () => controllerHost, getIsRichTextSelected: () => true,
    isRichTextNode: node => node?.atomType === 'html-block',
    markChanged() { controllerError = ''; }, normalizeHtml: normalizeSparcRichHtml, messages,
    setErrorText(message) { controllerError = message; }, onRevision() {},
  });
  try {
    controller.ensureHtmlEditor();
    const invalid = html.replace('headers="first values"', 'headers="missing"');
    controller.updateRichTextSource(invalid);
    controller.syncHtmlEditor();
    assert.match(controllerError, /headers reference/);
    assert.equal(draft.value, normalizeSparcRichHtml(invalid));
    controller.runRichTextCommand('bold');
    assert.equal(draft.value, normalizeSparcRichHtml(invalid));
    assert.throws(() => validateSparcDisplaysBeforeSave({ sparcTargets: [{ pageIndex: 0, label: 'Synthetic' }],
      sparcPages: [{ display: { nodes: [draft] } }], clusters: [] }), /headers reference/);
    controller.updateRichTextSource(html);
    assert.equal(controllerError, '');
    assert.deepEqual(validateSparcRichHtml(draft.value), []);
  } finally { controller.destroy(); }
}

function assertRendererSupportsStoredRichTextHooks() {
  const presentationSource = fs.readFileSync(
    path.join(repoRoot, 'mofacts/public/styles/instructional-content.css'),
    'utf8',
  );

  for (const selector of [
    '.sparc-align-center',
    '[data-align="center"]',
    '.sparc-color-accent',
    '.sparc-color-error',
    'ul[data-type="taskList"]',
    '[data-sparc-callout]',
    '[data-sparc-callout="success"]',
    '[data-sparc-callout="warning"]',
    '[data-sparc-callout="error"]',
    '.sparc-html-block figcaption',
    '.sparc-html-block .oli-embed iframe',
  ]) {
    assert.match(presentationSource, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}

assertSanitizerPreservesSupportedRichText();
assertSanitizerStripsUnsafeHtml();
assertValidationRejectsUnsafeEmbedsAndClasses();
assertNormalizationUsesClassDataRepresentation();
assertTableSemanticsSurviveWithoutSharingRenderIds();
assertTableRelationshipsAreLocalAndUnambiguous();
assertTableSupportDoesNotExposeAuthoredAppIds();
assertVisualEditorPreservesTableSemantics();
assertTableCommandsPreserveGroupsAndRejectBrokenReferences();
assertRendererSupportsStoredRichTextHooks();

console.log(JSON.stringify({ sparcRichHtmlCheck: true }));
