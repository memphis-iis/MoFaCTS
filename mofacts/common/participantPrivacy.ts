export const PARTICIPANT_TOKEN_PREFIX = 'study.v1.';

export function studyOnlyAccount(user: any): boolean {
  return user?.profile?.createdBy !== 'publicDemo' && (
    user?.profile?.experiment === true || user?.profile?.experiment === 'true'
    || user?.profile?.createdBy === 'provisionExperimentUser'
    || user?.profile?.createdBy === 'startProlificParticipation'
  );
}
