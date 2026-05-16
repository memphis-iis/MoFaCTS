import { expect } from 'chai';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { convertConfigDeliverySettingsDirectory } from '../../scripts/convertConfigDeliverySettings';
import { convertDeliverySettingsInCollections } from './convert_delivery_settings';

const paramsKey = ['delivery', 'params'].join('');
const displayKey = ['ui', 'Settings'].join('');

type MutableDoc = Record<string, any> & { _id: string };

function withOldFields<T extends Record<string, any>>(
  record: T,
  oldParams?: Record<string, unknown> | Array<Record<string, unknown>>,
  oldDisplay?: Record<string, unknown> | Array<Record<string, unknown>>
): T {
  const target = record as Record<string, unknown>;
  if (oldParams !== undefined) {
    target[paramsKey] = oldParams;
  }
  if (oldDisplay !== undefined) {
    target[displayKey] = oldDisplay;
  }
  return record;
}

function findOldFieldPaths(value: unknown, pathParts: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findOldFieldPaths(entry, [...pathParts, String(index)]));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const paths: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...pathParts, key];
    if (key === paramsKey || key === displayKey) {
      paths.push(nextPath.join('.'));
    }
    paths.push(...findOldFieldPaths(entry, nextPath));
  }
  return paths;
}

function createMemoryCollection<T extends MutableDoc>(docs: T[]) {
  const updates: Array<{ selector: Record<string, unknown>; modifier: Record<string, any> }> = [];
  return {
    updates,
    find: () => ({
      fetchAsync: async () => docs,
    }),
    updateAsync: async (selector: Record<string, unknown>, modifier: Record<string, any>) => {
      updates.push({ selector, modifier });
      const doc = docs.find((entry) => entry._id === selector._id);
      if (doc && modifier.$set) {
        Object.assign(doc, modifier.$set);
      }
    },
  };
}

describe('delivery settings production migration', function() {
  it('converts TDF documents and learner cache configs in write mode', async function() {
    const tdfContent = {
      tdfs: {
        tutor: withOldFields(
          {
            setspec: {
              [displayKey]: {
                displayCorrectFeedback: 'false',
              },
              unitTemplate: [
                withOldFields({}, { reviewstudy: '6000' }),
              ],
            },
            unit: [
              withOldFields({}, [{ lockoutminutes: '2' }], { feedbackLayout: 'inline' }),
            ],
          },
          { drill: '30000' }
        ),
      },
    };
    const cacheConfig = {
      source: {
        unitSignature: [
          JSON.stringify(withOldFields({ unitname: 'Practice' }, { drill: '10000' })),
        ],
      },
      overrides: withOldFields(
        {
          setspec: {
            [displayKey]: {
              displayIncorrectFeedback: 'false',
            },
          },
          unit: {
            '0': withOldFields({}, { reviewstudy: '6000' }),
          },
        },
        { drill: '45000' }
      ),
    };
    const tdfs = createMemoryCollection([
      { _id: 'tdf-a', content: tdfContent, fileName: 'tdf-a.json' },
    ]);
    const dashboardCache = createMemoryCollection([
      {
        _id: 'cache-a',
        userId: 'learner-a',
        learnerTdfConfigs: {
          'tdf-a': cacheConfig,
        },
      },
    ]);

    const report = await convertDeliverySettingsInCollections(
      { Tdfs: tdfs, UserDashboardCache: dashboardCache },
      { dryRun: false, confirmWrite: 'convert-delivery-settings' }
    );

    expect(report.changed).to.equal(1);
    expect(report.updated).to.equal(1);
    expect(report.cacheChanged).to.equal(1);
    expect(report.cacheUpdated).to.equal(1);

    const tdfUpdate = tdfs.updates[0];
    expect(tdfUpdate).to.exist;
    const migratedTdf = tdfUpdate!.modifier.$set.content;
    expect(migratedTdf.tdfs.tutor.deliverySettings).to.deep.equal({
      displayCorrectFeedback: false,
      drill: 30000,
    });
    expect(migratedTdf.tdfs.tutor.unit[0].deliverySettings).to.deep.equal([
      { feedbackLayout: 'inline', lockoutminutes: 2 },
    ]);
    expect(migratedTdf.tdfs.tutor.setspec.unitTemplate[0].deliverySettings.reviewstudy).to.equal(6000);
    expect(findOldFieldPaths(migratedTdf)).to.deep.equal([]);

    const cacheUpdate = dashboardCache.updates[0];
    expect(cacheUpdate).to.exist;
    const migratedCache = cacheUpdate!.modifier.$set.learnerTdfConfigs['tdf-a'];
    expect(migratedCache.overrides.deliverySettings).to.deep.equal({
      displayIncorrectFeedback: false,
      drill: 45000,
    });
    expect(migratedCache.overrides.unit['0'].deliverySettings.reviewstudy).to.equal(6000);
    expect(migratedCache.source.unitSignature[0]).to.equal(
      '{"deliverySettings":{"drill":10000},"unitname":"Practice"}'
    );
    expect(findOldFieldPaths(migratedCache)).to.deep.equal([]);
  });

  it('requires explicit confirmation before database write mode', async function() {
    const tdfs = createMemoryCollection([
      { _id: 'tdf-a', content: { tdfs: { tutor: withOldFields({ setspec: {} }, { drill: '30000' }) } } },
    ]);
    const dashboardCache = createMemoryCollection([]);

    let error: Error | null = null;
    try {
      await convertDeliverySettingsInCollections(
        { Tdfs: tdfs, UserDashboardCache: dashboardCache },
        { dryRun: false }
      );
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).to.include('requires confirmWrite');
    expect(tdfs.updates).to.have.length(0);
  });
});

describe('delivery settings config directory conversion', function() {
  it('reports dry-run changes and writes canonical files on request', async function() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-delivery-settings-'));
    try {
      const file = path.join(tempDir, 'lesson.json');
      const source = {
        tutor: withOldFields(
          {
            setspec: {
              [displayKey]: {
                displayCorrectFeedback: 'false',
              },
            },
          },
          { drill: '30000' }
        ),
      };
      await fs.writeFile(file, `${JSON.stringify(source, null, 2)}\n`, 'utf8');

      const dryRun = await convertConfigDeliverySettingsDirectory({ configDir: tempDir });
      expect(dryRun.changedFiles).to.equal(1);
      expect(dryRun.writtenFiles).to.equal(0);
      expect(findOldFieldPaths(JSON.parse(await fs.readFile(file, 'utf8')))).to.not.deep.equal([]);

      const write = await convertConfigDeliverySettingsDirectory({ configDir: tempDir, write: true });
      expect(write.changedFiles).to.equal(1);
      expect(write.writtenFiles).to.equal(1);

      const migrated = JSON.parse(await fs.readFile(file, 'utf8'));
      expect(migrated.tutor.deliverySettings).to.deep.equal({
        displayCorrectFeedback: false,
        drill: 30000,
      });
      expect(findOldFieldPaths(migrated)).to.deep.equal([]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps old fields only when explicitly configured to do so', async function() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mofacts-delivery-settings-'));
    try {
      const file = path.join(tempDir, 'lesson.json');
      const source = {
        tutor: withOldFields({ setspec: {} }, { drill: '30000' }),
      };
      await fs.writeFile(file, `${JSON.stringify(source, null, 2)}\n`, 'utf8');

      await convertConfigDeliverySettingsDirectory({
        configDir: tempDir,
        write: true,
        removeLegacy: false,
      });

      const migrated = JSON.parse(await fs.readFile(file, 'utf8'));
      expect(migrated.tutor.deliverySettings.drill).to.equal(30000);
      expect(findOldFieldPaths(migrated)).to.deep.equal(['tutor.' + paramsKey]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
