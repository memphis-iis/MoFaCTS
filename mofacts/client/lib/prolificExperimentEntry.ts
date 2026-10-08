import { prolificId, prolificCompletionUrl, type ProlificIdentity } from '../../common/prolific';
export type ProlificExperimentEntry =
  | { mode: 'automatic'; identity: ProlificIdentity; participantId: string }
  | { mode: 'manual' }
  | { mode: 'error'; reason: string };

export function resolveProlificExperimentEntry(target: unknown, query: URLSearchParams | Record<string, unknown> | null | undefined, configuration?: { prolificCompletionUrl?: unknown; experimentPasswordRequired?: unknown }): ProlificExperimentEntry {
  const keys = ['PROLIFIC_PID', 'STUDY_ID', 'SESSION_ID'];
  const values = keys.map(key => query instanceof URLSearchParams ? query.getAll(key) : query && Object.hasOwn(query, key) ? [query[key]] : []);
  if (values.every(v => v.length === 0)) return { mode: 'manual' };
  try {
    if (values.some(v => v.length !== 1)) throw new Error('prolific.invalidIdentity');
    const [participantId, studyId, submissionId] = values.map(v => prolificId(v[0]));
    if (prolificId(target) !== studyId) throw new Error('prolific.identityConflict');
    if ([true, 'true'].includes(configuration?.experimentPasswordRequired as any)) throw new Error('prolific.passwordConflict');
    prolificCompletionUrl(configuration?.prolificCompletionUrl);
    return { mode: 'automatic', participantId: participantId!, identity: { participantId: participantId!, studyId: studyId!, submissionId: submissionId! } };
  } catch (error: any) { return { mode: 'error', reason: error.message }; }
}
