import { expect } from 'chai';
import { hydrateHomePracticeStateFromDashboardCache } from './homePracticeState';

describe('home practice state hydration', function() {
  it('checks the dashboard cache instead of forcing a rebuild', async function() {
    const calls: string[] = [];
    const sessionValues: Record<string, boolean> = {};

    await hydrateHomePracticeStateFromDashboardCache(
      {
        async callAsync(methodName: string) {
          calls.push(methodName);
          return { tdfCount: 2 };
        },
      },
      {
        set(key: string, value: boolean) {
          sessionValues[key] = value;
        },
      }
    );

    expect(calls).to.deep.equal(['ensureDashboardCacheCurrent']);
    expect(calls).to.not.include('initializeDashboardCache');
    expect(sessionValues.homeHasPracticeRecords).to.equal(true);
  });

  it('clears the home practice flag when the current cache has no TDF stats', async function() {
    const sessionValues: Record<string, boolean> = {};

    await hydrateHomePracticeStateFromDashboardCache(
      {
        async callAsync() {
          return { tdfCount: 0 };
        },
      },
      {
        set(key: string, value: boolean) {
          sessionValues[key] = value;
        },
      }
    );

    expect(sessionValues.homeHasPracticeRecords).to.equal(false);
  });
});
