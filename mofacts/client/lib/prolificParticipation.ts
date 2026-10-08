import { Meteor } from 'meteor/meteor';
import { Session } from 'meteor/session';
import { meteorCallAsync } from './meteorAsync';
import { prolificCompletionUrl } from '../../common/prolific';
import { finishLaunchLoading } from './launchLoading';

let retry: (() => Promise<void>) | null = null;
let finalizing: Promise<boolean> | null = null;
export function showParticipationSaveError(work: () => Promise<void>) {
  retry = work;
  finishLaunchLoading('prolific-save-failed');
  Session.set('prolificSaveUserId', Meteor.userId());
  Session.set('prolificSaveError', true);
}
export function participationSaveFailed(): boolean {
  return Session.get('prolificSaveError') === true && Session.get('prolificSaveUserId') === Meteor.userId();
}
export async function retryParticipationSave() {
  const work = retry;
  if (!work || !participationSaveFailed() || Session.get('prolificRetryBusy')) return;
  Session.set('prolificRetryBusy', true);
  Session.set('prolificSaveError', false);
  retry = null;
  try { await work(); if (!retry) Session.set('prolificSaveError', false); }
  catch { retry = work; Session.set('prolificSaveError', true); }
  finally { Session.set('prolificRetryBusy', false); }
}
export function isProlificAccount(): boolean {
  return (Meteor.user() as any)?.profile?.createdBy === 'startProlificParticipation';
}
/** Returns true only when external navigation has begun. Errors leave learner resources intact. */
export async function finalizeProlificSession(): Promise<boolean> {
  if (!isProlificAccount()) return false;
  if (finalizing) return finalizing;
  finalizing = (async () => {
    const initial = sessionStorage.getItem('prolificInitialReturn') === Meteor.userId();
    const result = await meteorCallAsync('completeProlificParticipation', initial) as any;
    if (!result?.completionUrl) return false;
    const url = prolificCompletionUrl(result.completionUrl);
    const { leavePage } = await import('../views/experiment/svelte/services/navigationCleanup');
    await leavePage(url, true);
    sessionStorage.removeItem('prolificInitialReturn');
    return true;
  })();
  try { return await finalizing; } finally { finalizing = null; }
}
export async function checkpointProlificLockout(): Promise<boolean> {
  if (!isProlificAccount()) return false;
  try { return await finalizeProlificSession(); }
  catch { showParticipationSaveError(async () => { await finalizeProlificSession(); }); return true; }
}
