import { expect } from 'chai';
import { extractJsonObject, extractJsonValue } from './jsonExtraction';

describe('JSON extraction', function() {
  it('extracts a top-level pair array from strict or fenced output', function() {
    const pairs = [{ kind: 'text', stimulus: '2 + 2', response: '4' }];
    expect(extractJsonValue(JSON.stringify(pairs))).to.deep.equal(pairs);
    expect(extractJsonValue(`Result:\n\`\`\`json\n${JSON.stringify(pairs)}\n\`\`\``)).to.deep.equal(pairs);
  });

  it('keeps object-only callers explicit', function() {
    expect(extractJsonObject('{"status":"ok"}')).to.deep.equal({ status: 'ok' });
    expect(() => extractJsonObject('[]')).to.throw('valid JSON object');
  });
});
