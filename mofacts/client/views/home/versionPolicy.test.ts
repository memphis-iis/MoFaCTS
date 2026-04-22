import { expect } from 'chai';
import { passesDashboardEntitlement } from './dashboardEntitlement';
import { evaluateDashboardVersionPolicy } from './versionPolicy';

describe('learning dashboard version policy', function() {
  it('blocks metadata-invalid brand-new learners', function() {
    const decision = evaluateDashboardVersionPolicy({
      tdfId: 'tdf-1',
      isAssigned: false,
      hasMeaningfulProgress: false,
      versionMeta: {
        tdfId: 'tdf-1',
        lineageId: null,
        versionMajor: null,
        publishedAtMs: null,
        isPublished: null,
      },
      currentVersionByLineage: new Map<string, string>(),
    });

    expect(decision.passes).to.equal(false);
    expect(decision.metadataInvalid).to.equal(true);
    expect(decision.reason).to.equal('metadata-invalid-no-progress');
  });

  it('keeps in-flight and assignment override access even when metadata is invalid', function() {
    const inflight = evaluateDashboardVersionPolicy({
      tdfId: 'tdf-1',
      isAssigned: false,
      hasMeaningfulProgress: true,
      versionMeta: undefined,
      currentVersionByLineage: new Map<string, string>(),
    });
    expect(inflight.passes).to.equal(true);
    expect(inflight.metadataInvalid).to.equal(true);

    const assigned = evaluateDashboardVersionPolicy({
      tdfId: 'tdf-1',
      isAssigned: true,
      hasMeaningfulProgress: false,
      versionMeta: undefined,
      currentVersionByLineage: new Map<string, string>(),
    });
    expect(assigned.passes).to.equal(true);
    expect(assigned.metadataInvalid).to.equal(true);
  });

  it('hides non-current versions for learners without progress when metadata is valid', function() {
    const decision = evaluateDashboardVersionPolicy({
      tdfId: 'tdf-1',
      isAssigned: false,
      hasMeaningfulProgress: false,
      versionMeta: {
        tdfId: 'tdf-1',
        lineageId: 'lineage-1',
        versionMajor: 1,
        publishedAtMs: null,
        isPublished: true,
      },
      currentVersionByLineage: new Map([['lineage-1', 'tdf-2']]),
    });

    expect(decision.passes).to.equal(false);
    expect(decision.metadataInvalid).to.equal(false);
    expect(decision.reason).to.equal('legacy-without-progress');
  });

  it('does not re-filter lessons that were already authorized by the server publication', function() {
    expect(passesDashboardEntitlement({ isPublishedByServer: true })).to.equal(true);
    expect(passesDashboardEntitlement({ isPublishedByServer: false })).to.equal(false);
  });
});
