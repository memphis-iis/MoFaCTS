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

function assertRendererSupportsStoredRichTextHooks() {
  const rendererSource = fs.readFileSync(
    path.join(repoRoot, 'mofacts/client/views/experiment/svelte/components/SparcNode.svelte'),
    'utf8',
  );

  for (const selector of [
    '.sparc-align-center',
    '[data-align="center"]',
    '.sparc-color-accent',
    '.sparc-color-error',
    'ul[data-type="taskList"]',
    '[data-sparc-callout]',
    '[data-sparc-callout="correct"]',
    '[data-sparc-callout="warning"]',
    '[data-sparc-callout="error"]',
    '.sparc-html-block table',
    '.sparc-html-block figcaption',
    '.sparc-html-block .oli-embed iframe',
  ]) {
    assert.match(rendererSource, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}

assertSanitizerPreservesSupportedRichText();
assertSanitizerStripsUnsafeHtml();
assertValidationRejectsUnsafeEmbedsAndClasses();
assertNormalizationUsesClassDataRepresentation();
assertRendererSupportsStoredRichTextHooks();

console.log(JSON.stringify({ sparcRichHtmlCheck: true }));
