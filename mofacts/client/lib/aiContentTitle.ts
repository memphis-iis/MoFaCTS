import type {
  AiContentIntent,
  AiCreationMode,
} from '../../common/aiContentContract';

const MAX_AI_CONTENT_TITLE_LENGTH = 100;

function conciseSubject(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/^the\s+/i, '')
    .trim();
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const prefix = value.slice(0, maxLength + 1);
  const lastSpace = prefix.lastIndexOf(' ');
  return (lastSpace > 0 ? prefix.slice(0, lastSpace) : value.slice(0, maxLength)).trim();
}

export function aiContentSystemTitle(
  intent: AiContentIntent,
  itemCount: number,
  mode: AiCreationMode,
): string {
  const subject = conciseSubject(intent.subject) || 'created content';
  const count = Number.isInteger(itemCount) && itemCount > 1 && !/^\d+\b/.test(subject)
    ? `${itemCount} `
    : '';
  const action = mode === 'test' ? 'Test' : 'Learn';
  return truncateAtWord(`${action} the ${count}${subject}`, MAX_AI_CONTENT_TITLE_LENGTH);
}
