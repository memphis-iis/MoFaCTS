import { strict as assert } from 'node:assert';
import DOMPurify from 'dompurify';
import { renderSparcInstructionMarkdown } from './sparcInstructionMarkdown';

describe('SPARC instructional Markdown', () => {
  const render = (text: string) => renderSparcInstructionMarkdown(text, DOMPurify.sanitize.bind(DOMPurify));
  it('renders comparison tables and emphasis after saved text is reloaded', () => {
    const text = JSON.parse(JSON.stringify('| Feature | A | B |\n| --- | --- | --- |\n| **Isolation** | Partial | Complete |'));
    const html = render(text);
    assert.match(html, /<table>/);
    assert.match(html, /<th>Feature<\/th>/);
    assert.match(html, /<strong>Isolation<\/strong>/);
    assert.match(html, /<td>Partial<\/td>/);
  });
  it('accepts whole Markdown envelopes but preserves ordinary code fences', () => {
    assert.match(render('```md\n**Comparison**\n```'), /<strong>Comparison<\/strong>/);
    assert.match(render('```markdown\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```'), /<table>/);
    assert.match(render('```js\nconst a = 1;\n```'), /<pre><code/);
  });
  it('sanitizes after parsing and blocks embedded media and executable HTML', () => {
    const html = render('[bad](javascript:alert%281%29)\n<img src="https://example.com/track" onerror="alert(1)"><script>alert(1)</script><iframe src="https://example.com"></iframe><b style="color:red" onclick="alert(1)">Safe</b>');
    assert.doesNotMatch(html, /javascript:|<img|<script|<iframe|style=|onclick=|onerror=/i);
    assert.match(html, /<b>Safe<\/b>/);
  });
  it('retains semantic HTML in older rich content and ordinary text', () => {
    assert.match(render('<table><tr><th>A</th></tr><tr><td>B</td></tr></table>'), /<th>A<\/th>/);
    assert.match(render('A < B and C > D'), /A &lt; B and C &gt; D/);
  });
});
