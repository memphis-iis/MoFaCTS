export function authorizationBindingsFixture() {
  return { schema: 'MoFaCTSAuditAuthorizationBindingsV1',
    actors: Object.fromEntries(['learnerA', 'learnerB', 'teacherA', 'teacherB', 'admin'].map(name =>
      [name, { userId: `synthetic-${name}`, username: `synthetic-${name}`, password: `synthetic-private-${name}` }])),
    values: { 'lesson.progress': 'synthetic-lesson', 'progress.learnerA': 'synthetic-progress-a', 'progress.learnerB': 'synthetic-progress-b',
      'progress.teacherA': 'synthetic-progress-c', 'progress.teacherB': 'synthetic-progress-d',
      'performance.learnerB': { numCorrect: 1, numIncorrect: 0, stimsIntroduced: 1, practiceDuration: 0, totalStimCount: 1 },
      'settings.canary': { documentId: 'synthetic-setting', key: 'synthetic-setting', value: true },
      'history.learnerA': { sha256: 'a'.repeat(64) }, 'audit.report': { reportId: 'synthetic-report', digestSha256: 'b'.repeat(64) } } };
}
