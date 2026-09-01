import { expect } from 'chai';
import { buildLearnerAnalyticsOverview, createLearnerAnalyticsMethods } from './learnerAnalyticsMethods';

class MeteorError extends Error {
  error: string;

  constructor(error: string, message: string) {
    super(message);
    this.error = error;
  }
}

function createMethodFixture(rowCount = 0) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    _id: String(index + 1).padStart(6, '0'),
    userId: 'learner',
    TDFId: 'lesson',
    levelUnit: 0,
    levelUnitType: 'model',
    outcome: index % 2 === 0 ? 'correct' : 'incorrect',
    recordedServerTime: new Date(index * 1000).toISOString(),
  }));
  const historyQueries: Array<{ selector: any; options: any }> = [];
  let authorizationChecks = 0;
  let authorized = true;
  const lesson = {
    TDFId: 'lesson',
    displayName: 'Lesson',
    firstContentUnitType: 'learning',
    currentStimuliSetId: null,
    progress: { lastPracticed: '2026-08-08T12:00:00.000Z' },
  };
  const rootTdfDoc = {
    _id: 'lesson',
    stimuliSetId: null,
    content: { tdfs: { tutor: { unit: [{}] } } },
  };
  const Histories = {
    find(selector: any, options: any = {}) {
      historyQueries.push({ selector, options });
      let selected = rows.filter((row) => (
        row.userId === selector.userId
        && selector.TDFId.$in.includes(row.TDFId)
        && (!selector._id?.$lte || row._id <= selector._id.$lte)
        && (!selector._id?.$gt || row._id > selector._id.$gt)
      ));
      selected.sort((left, right) => options.sort?._id === -1
        ? right._id.localeCompare(left._id)
        : left._id.localeCompare(right._id));
      if (Number.isSafeInteger(options.limit)) selected = selected.slice(0, options.limit);
      if (options.fields) {
        selected = selected.map((row) => Object.fromEntries(
          Object.keys(options.fields).filter((key) => options.fields[key] && key in row).map((key) => [key, (row as any)[key]]),
        )) as typeof rows;
      }
      return {
        fetchAsync: async () => selected,
        countAsync: async () => selected.length,
      };
    },
  };
  const methods = createLearnerAnalyticsMethods({
    Meteor: { Error: MeteorError },
    Tdfs: { findOneAsync: async ({ _id }: any) => _id === 'lesson' ? rootTdfDoc : null },
    Histories,
    StimulusCrowdStats: { find: () => ({ fetchAsync: async () => [] }) },
    getPracticeDashboardSnapshot: async () => {
      authorizationChecks += 1;
      return { lessons: authorized ? [lesson] : [] };
    },
    getStimuliSetById: async () => [],
    getResponseKCMapForTdf: async () => ({}),
    now: () => Date.parse('2026-08-08T12:00:00.000Z'),
  });
  return {
    rows,
    methods,
    historyQueries,
    get authorizationChecks() { return authorizationChecks; },
    revokeAuthorization() { authorized = false; },
  };
}

describe('learnerAnalyticsMethods', function() {
  it('offers only practiced study sets and defaults to the most recent one', function() {
    const overview = buildLearnerAnalyticsOverview({
      lessons: [
        { TDFId: 'unused', displayName: 'Unused', firstContentUnitType: 'learning', progress: { lastPracticed: null } },
        { TDFId: 'older', displayName: 'Older', firstContentUnitType: 'learning', progress: { lastPracticed: '2026-08-01T12:00:00.000Z' } },
        { TDFId: 'newer', displayName: 'Newer', firstContentUnitType: 'autotutor', progress: { lastPracticed: '2026-08-08T12:00:00.000Z' } },
      ],
    });

    expect(overview.lessons.map((lesson) => lesson.rootTdfId)).to.deep.equal(['newer', 'older']);
    expect(overview.defaultLessonId).to.equal('newer');
  });

  it('requires authentication and lesson authorization for source data', async function() {
    const fixture = createMethodFixture();
    let unauthenticated: unknown;
    try {
      await fixture.methods.getLearnerLessonAnalyticsSource.call({ userId: null }, { rootTdfId: 'lesson' });
    } catch (error) {
      unauthenticated = error;
    }
    expect(unauthenticated).to.be.instanceOf(MeteorError).and.have.property('error', 'not-authorized');

    fixture.revokeAuthorization();
    let unauthorized: unknown;
    try {
      await fixture.methods.getLearnerLessonAnalyticsSource.call({ userId: 'learner' }, { rootTdfId: 'lesson' });
    } catch (error) {
      unauthorized = error;
    }
    expect(unauthorized).to.be.instanceOf(MeteorError).and.have.property('error', 'not-authorized');
  });

  it('returns a versioned empty source without unrelated learner fields', async function() {
    const fixture = createMethodFixture();
    const source = await fixture.methods.getLearnerLessonAnalyticsSource.call(
      { userId: 'learner' },
      { rootTdfId: 'lesson' },
    );
    expect(source.version).to.equal(1);
    expect(source.historyRowCount).to.equal(0);
    expect(source.historyPage).to.deep.equal({ version: 1, rows: [], nextCursor: null });
    expect(source.modelInput?.tdfDoc).to.not.have.property('userId');
  });

  it('uses stable, self-scoped 1000-row pagination and reauthorizes every page', async function() {
    const fixture = createMethodFixture(1002);
    const source = await fixture.methods.getLearnerLessonAnalyticsSource.call(
      { userId: 'learner' },
      { rootTdfId: 'lesson' },
    );
    expect(source.historyPage.rows).to.have.length(1000);
    expect(source.historyRowCount).to.equal(1002);
    expect(source.historyPage.nextCursor).to.be.a('string');
    if (!source.historyPage.nextCursor) throw new Error('Expected another history page');

    fixture.rows.push({
      _id: '999999', userId: 'learner', TDFId: 'lesson', levelUnit: 0,
      levelUnitType: 'model', outcome: 'correct', recordedServerTime: new Date().toISOString(),
    });
    const secondPage = await fixture.methods.getLearnerLessonAnalyticsHistoryPage.call(
      { userId: 'learner' },
      { rootTdfId: 'lesson', cursor: source.historyPage.nextCursor },
    );
    expect(secondPage.rows).to.have.length(2);
    expect(secondPage.nextCursor).to.equal(null);
    expect(fixture.authorizationChecks).to.equal(2);
    expect(fixture.historyQueries.every(({ selector }) => selector.userId === 'learner')).to.equal(true);
    const pageQuery = fixture.historyQueries.find(({ options }) => options.limit === 1001);
    expect(pageQuery?.options.fields).to.not.have.property('userId');
  });

  it('rejects invalid cursors before reading another history page', async function() {
    const fixture = createMethodFixture();
    let caught: unknown;
    try {
      await fixture.methods.getLearnerLessonAnalyticsHistoryPage.call(
        { userId: 'learner' },
        { rootTdfId: 'lesson', cursor: 'not-a-cursor' },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(MeteorError).and.have.property('error', 'invalid-args');
    expect(fixture.historyQueries).to.deep.equal([]);
  });
});
