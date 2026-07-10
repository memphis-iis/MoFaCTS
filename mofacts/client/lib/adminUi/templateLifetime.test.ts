import { expect } from 'chai';
import { createTemplateLifetime } from './templateLifetime';

describe('admin UI template lifetime', function() {
  it('makes a newer operation supersede an earlier generation', function() {
    const lifetime = createTemplateLifetime();
    const first = lifetime.begin();
    const second = lifetime.begin();

    expect(lifetime.isCurrent(first)).to.equal(false);
    expect(lifetime.isCurrent(second)).to.equal(true);
  });

  it('invalidates the active generation on explicit supersession', function() {
    const lifetime = createTemplateLifetime();
    const generation = lifetime.begin();

    lifetime.supersede();

    expect(lifetime.isCurrent(generation)).to.equal(false);
  });

  it('rejects all completion and new work after destruction', function() {
    const lifetime = createTemplateLifetime();
    const generation = lifetime.begin();

    lifetime.destroy();

    expect(lifetime.isDestroyed()).to.equal(true);
    expect(lifetime.isCurrent(generation)).to.equal(false);
    expect(() => lifetime.begin()).to.throw('destroyed template lifetime');
  });
});

