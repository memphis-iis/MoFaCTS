import { expect } from 'chai';
import { createRedisBoundary } from './redisBoundary';

describe('redisBoundary', function() {
  it('requires REDIS_URL when open-core Redis is enabled', function() {
    expect(() => createRedisBoundary({ openCore: { requireRedis: true } }, { REDIS_URL: '' }))
      .to.throw('REDIS_URL is required when openCore.requireRedis is true');
  });

  it('uses an explicit disabled boundary when Redis is not required', async function() {
    const boundary = createRedisBoundary({ openCore: { requireRedis: false } }, {});
    let ran = false;

    const result = await boundary.withLock('dashboard-cache:test', 1000, async () => {
      ran = true;
      return 'ok';
    });

    expect(boundary.enabled).to.equal(false);
    expect(ran).to.equal(true);
    expect(result).to.equal('ok');
  });

  it('fails clearly when Redis is configured but unavailable', async function() {
    const boundary = createRedisBoundary(
      { openCore: { requireRedis: true } },
      { REDIS_URL: 'redis://127.0.0.1:1/0' }
    );

    try {
      await boundary.ping();
      throw new Error('Expected Redis ping to fail');
    } catch (error) {
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.not.equal('Expected Redis ping to fail');
    }
  });
});
