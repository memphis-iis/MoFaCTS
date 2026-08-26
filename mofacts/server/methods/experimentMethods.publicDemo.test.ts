import { expect } from 'chai';
import { generatePublicDemoUsername } from './experimentMethods';

describe('public demo experiment identities', function() {
  it('generates constrained cryptographic participant identifiers', function() {
    const values = new Set(Array.from({ length: 64 }, () => generatePublicDemoUsername('researcher')));
    expect(values.size).to.equal(64);
    for (const value of values) {
      expect(value).to.match(/^DEMO-R-[A-F0-9]{24}$/);
      expect(value.length).to.equal(31);
    }
  });
});
