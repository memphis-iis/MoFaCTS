import { expect } from 'chai';
import {
  readAutoTutorHistoryNote,
  validateAutoTutorSavedEndState,
} from '../../learning-components/units/autotutor/AutoTutorSavedHistory';

function createNote(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'autotutor',
    model: 'openai/test-model',
    scriptId: 'script-1',
    state: { turnCount: 1 },
    progress: 0.5,
    completed: false,
    mastered: false,
    endReason: 'in_progress',
    stoppedByCost: false,
    tutorMessage: 'Try connecting that to the population mean.',
    ...overrides,
  };
}

describe('AutoTutor saved history', function() {
  it('reads a valid AutoTutor CFNote payload from a history row', function() {
    const note = createNote({ scriptId: 'script-2' });

    expect(readAutoTutorHistoryNote({ CFNote: JSON.stringify(note) })).to.deep.equal(note);
  });

  it('rejects missing, malformed, legacy-versioned, and non-AutoTutor notes clearly', function() {
    expect(() => readAutoTutorHistoryNote({}))
      .to.throw('AutoTutor history row is missing CFNote');
    expect(() => readAutoTutorHistoryNote({ CFNote: '{' }))
      .to.throw('AutoTutor history row CFNote is not valid JSON');
    expect(() => readAutoTutorHistoryNote({ CFNote: JSON.stringify({ kind: 'other', state: {} }) }))
      .to.throw('AutoTutor history row CFNote has an invalid AutoTutor payload');
    expect(() => readAutoTutorHistoryNote({ CFNote: JSON.stringify(createNote({ schemaVersion: 1 })) }))
      .to.throw('AutoTutor history row CFNote must not include schemaVersion');
  });

  it('validates saved completion flags and explicit end reasons', function() {
    expect(() => validateAutoTutorSavedEndState(readAutoTutorHistoryNote({
      CFNote: JSON.stringify(createNote({ completed: true, mastered: true, endReason: 'mastery' })),
    }))).not.to.throw();

    expect(() => validateAutoTutorSavedEndState(readAutoTutorHistoryNote({
      CFNote: JSON.stringify(createNote({ endReason: 'timeout' })),
    }))).to.throw('AutoTutor saved history mastery flags must be present and valid');
  });
});
