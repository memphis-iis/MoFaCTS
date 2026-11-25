import assert from 'node:assert/strict';
import { auditDigest } from '../../common/securityAudit/canonicalReport';
import { readStartupSurfaceInventory } from './startupSurfaceInventory';
import { createSurfaceInventorySeal, type StartupProfile, type StartupSurface } from './surfaceInventorySeal';

const profile: StartupProfile = { mode: 'test', meteorRelease: 'synthetic' };
const row = (surfaceId: string, verificationId: string): StartupSurface => ({
  surfaceId, owner: 'synthetic-owner', policy: 'authenticated', dataEgress: 'none', verificationIds: [verificationId],
});

describe('startup surface inventory', () => {
  it('waits for both startup owners and invalidates changed registrations after sealing', () => {
    let surfaces = [row('method:b', 'verify.b'), row('method:a', 'verify.a')];
    const source = createSurfaceInventorySeal(() => ({ profile, surfaces }), new Set(['verify.a', 'verify.b', 'verify.c']));
    source.complete('entrypoint-modules');
    assert.deepEqual(source.read(), { state: 'unavailable', reason: 'startup-incomplete' });
    source.complete('application-startup');
    const sealed = source.read();
    if (sealed.state !== 'sealed') throw Error(sealed.reason);
    assert.deepEqual(sealed.inventory.surfaces.map(item => item.surfaceId), ['method:a', 'method:b']);
    surfaces = [...surfaces].reverse();
    assert.deepEqual(source.read(), sealed);
    surfaces.push(row('method:c', 'verify.c'));
    assert.deepEqual(source.read(), { state: 'unavailable', reason: 'registration-changed-after-startup' });
  });

  it('refuses duplicate surface IDs, unresolved verification IDs, and duplicate startup signals', () => {
    for (const surfaces of [
      [row('method:a', 'verify.a'), row('method:a', 'verify.b')],
      [row('method:a', 'verify.absent')],
      [row('method:a', 'verify.a'), row('method:b', 'verify.a')],
    ]) {
      const registry = createSurfaceInventorySeal(() => ({ profile, surfaces }), new Set(['verify.a', 'verify.b']));
      registry.complete('entrypoint-modules');
      registry.complete('application-startup');
      assert.deepEqual(registry.read(), { state: 'unavailable', reason: 'invalid-surface-inventory' });
    }
    const registry = createSurfaceInventorySeal(() => ({ profile, surfaces: [] }), new Set());
    registry.complete('entrypoint-modules');
    registry.complete('entrypoint-modules');
    assert.deepEqual(registry.read(), { state: 'unavailable', reason: 'startup-owner-signaled-twice' });
  });

  it('seals the actual application after static and asynchronous startup registration', async () => {
    const observed = readStartupSurfaceInventory();
    if (observed.state !== 'sealed') throw Error(observed.reason);
    assert.equal(await auditDigest(observed.inventory), observed.inventorySha256);
    assert.equal(await auditDigest(observed.inventory.profile), observed.profileSha256);
    const rows = observed.inventory.surfaces;
    assert.equal(new Set(rows.map(row => row.surfaceId)).size, rows.length);
    assert.equal(rows.filter(row => row.owner === 'application-method').length, 193);
    assert.equal(rows.filter(row => row.owner === 'named-publication').length, 21);
    assert.ok(rows.some(row => row.surfaceId === 'framework:accounts-base:on-create-user'));
    assert.ok(rows.some(row => row.surfaceId === 'framework:webapp:external-runtime-config'));
    assert.ok(rows.some(row => row.surfaceId === 'middleware:cdn-public-assets'));
  });
});
