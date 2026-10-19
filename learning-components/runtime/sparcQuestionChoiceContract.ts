export type SparcQuestionChoice = { readonly id: string; readonly label: string; readonly correct: boolean };

export function parseSparcQuestionChoices(value: unknown, format: 'multiple-choice' | 'true-false' = 'multiple-choice'): readonly SparcQuestionChoice[] {
  if (format === 'true-false') {
    if (!Array.isArray(value) || value.length !== 2) throw new Error('True/false question requires exactly 2 choices');
  } else if (!Array.isArray(value) || value.length < 3 || value.length > 4) throw new Error('Multiple-choice question requires 3 or 4 choices');
  const ids = new Set<string>();
  const labels = new Set<string>();
  const choices = value.map(choice => {
    if (!choice || typeof choice !== 'object' || Array.isArray(choice)
      || Object.keys(choice).some(key => !['id', 'label', 'correct'].includes(key))
      || typeof choice.correct !== 'boolean' || typeof choice.id !== 'string' || !/^[a-zA-Z0-9_-]{1,24}$/.test(choice.id)) {
      throw new Error('Invalid multiple-choice option');
    }
    const label = typeof choice.label === 'string' ? choice.label.trim() : '';
    if (!label) throw new Error('Multiple-choice option label is required');
    if (label.length > 240 || /<\/?[a-z][^>]*>/i.test(label)) throw new Error('Multiple-choice option requires short plain text');
    if (ids.has(choice.id) || labels.has(label)) throw new Error('Multiple-choice options must have distinct identities and labels');
    ids.add(choice.id); labels.add(label);
    return { id: choice.id, label, correct: choice.correct };
  });
  if (choices.filter(choice => choice.correct).length !== 1) throw new Error('Multiple-choice question requires exactly one correct option');
  if (format === 'true-false' && (choices[0]?.id !== 'true' || choices[0]?.label !== 'True'
    || choices[1]?.id !== 'false' || choices[1]?.label !== 'False')) throw new Error('True/false choices must be True then False with stable true/false IDs');
  return choices;
}
