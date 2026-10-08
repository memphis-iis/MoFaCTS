/** Prolific identifiers are opaque; normalize the hexadecimal IDs consistently. */
export const PROLIFIC_ID = /^[a-f0-9]{24}$/i;
export const PROLIFIC_COMPLETION_URL = /^https:\/\/app\.prolific\.com\/submissions\/complete\?cc=[A-Za-z0-9]+(?![\s\S])/;
export type ProlificIdentity = { participantId: string; studyId: string; submissionId: string };
export function prolificId(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 24 || !PROLIFIC_ID.test(value)) throw new Error('prolific.invalidIdentity');
  return value.toLowerCase();
}
export function prolificCompletionUrl(value: unknown): string {
  if (typeof value !== 'string' || !PROLIFIC_COMPLETION_URL.test(value)) throw new Error('prolific.invalidConfiguration');
  return value;
}
export function prolificAmount(value: unknown): number {
  if (typeof value !== 'string' || value.trim() !== value || !/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value)) throw new Error('prolific.invalidAmount');
  const cents = Math.round(Number(value) * 100);
  if (cents <= 0) throw new Error('prolific.invalidAmount');
  return cents;
}
