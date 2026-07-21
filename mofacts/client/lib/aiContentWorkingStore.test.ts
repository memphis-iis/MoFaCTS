import { expect } from 'chai';
import { AI_CONTENT_CONTRACT_VERSION, type AiContentWorkingRecord } from '../../common/aiContentContract';
import {
  clearAiContentWorkingSnapshot,
  loadAiContentWorkingSnapshot,
  saveAiContentWorkingSnapshot,
  type AiContentWorkingSnapshot,
} from './aiContentWorkingStore';

const USER_A = 'ai-content-working-store-test-user-a';
const USER_B = 'ai-content-working-store-test-user-b';

function snapshot(notes: string): AiContentWorkingSnapshot {
  const record: AiContentWorkingRecord = {
    contractVersion: AI_CONTENT_CONTRACT_VERSION,
    phase: 'input',
    notes,
    mode: 'learning',
    title: '',
    model: '',
    inputAssetIds: [],
    pairs: [],
    warnings: [],
    updatedAt: '2026-07-21T00:00:00.000Z',
  };
  return { record, assets: [] };
}

describe('AI Content Creator user-scoped working storage', function() {
  beforeEach(async function() {
    await clearAiContentWorkingSnapshot(USER_A);
    await clearAiContentWorkingSnapshot(USER_B);
  });

  afterEach(async function() {
    await clearAiContentWorkingSnapshot(USER_A);
    await clearAiContentWorkingSnapshot(USER_B);
  });

  it('does not load another authenticated user\'s working record', async function() {
    await saveAiContentWorkingSnapshot(USER_A, snapshot('private notes for user A'));

    expect(await loadAiContentWorkingSnapshot(USER_B)).to.equal(null);
    expect((await loadAiContentWorkingSnapshot(USER_A))?.record.notes).to.equal('private notes for user A');
  });

  it('does not delete another authenticated user\'s working record', async function() {
    await saveAiContentWorkingSnapshot(USER_A, snapshot('private notes for user A'));
    await saveAiContentWorkingSnapshot(USER_B, snapshot('private notes for user B'));

    await clearAiContentWorkingSnapshot(USER_B);

    expect(await loadAiContentWorkingSnapshot(USER_B)).to.equal(null);
    expect((await loadAiContentWorkingSnapshot(USER_A))?.record.notes).to.equal('private notes for user A');
  });
});
