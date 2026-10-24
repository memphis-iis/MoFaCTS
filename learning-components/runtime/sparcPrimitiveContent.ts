import type { SparcPrimitiveContent, SparcPrimitiveContext } from './sparcMoveLibraryContract';
import { parseSparcPromptFigure } from '../../mofacts/common/lib/sparcPromptImage';
import { parseSparcVideoSegment } from './sparcVideo';
import { parseSparcQuestionChoices } from './sparcQuestionChoiceContract';
import { isSparcChoiceFormat, validateSparcClozeQuestion, SPARC_QUESTION_RESPONSE_FORMATS } from './sparcTargetCategories';

export function validatePrimitiveContent(value: SparcPrimitiveContent, context: SparcPrimitiveContext, unresolvedVisual = false): SparcPrimitiveContent {
  if (context.kind === 'instruction') {
    if (Object.keys(value ?? {}).some(key => !['text', 'support'].includes(key))) throw new Error('Unexpected instruction field');
    const explanationContext = { ...context, kind: 'explanation' as const };
    delete explanationContext.supportKind;
    validatePrimitiveContent({ text: value.text }, explanationContext);
    const requiresSupport = context.components.includes('richContent');
    if (requiresSupport !== !!value.support) throw new Error('Instruction composition does not match the selected move');
    if (value.support) {
      const supportContext = { ...context, kind: 'richContent' as const };
      if (unresolvedVisual) delete supportContext.supportKind;
      validatePrimitiveContent(value.support, supportContext);
    }
    return value;
  }
  if (typeof value?.text !== 'string' || !value.text.trim()) throw new Error('Invalid primitive text');
  if (Object.keys(value).some(k => !['text', 'figure', 'video', 'choices', 'supportHeading'].includes(k))) throw new Error('Unexpected primitive field');
  if (context.supportKind === 'visual' && !value.video && !value.figure) throw new Error('The visual move requires a video or image');
  if (context.supportKind === 'written' && (value.video || value.figure)) throw new Error('The written move cannot select visual support');
  if (/<\s*(script|iframe|input|button|style)|\bon\w+\s*=|javascript:/i.test(value.text)) throw new Error('Unsafe instructional markup');
  if (value.video) { if (context.kind !== 'richContent' || value.figure || value.supportHeading || value.text !== value.video.transcript) throw new Error('Video requires standalone rich support'); parseSparcVideoSegment(value.video); }
  if (value.figure) { if (context.kind !== 'richContent') throw new Error('Figure requires rich support'); parseSparcPromptFigure(value.figure); }
  if (value.supportHeading) { if (typeof value.supportHeading !== 'string' || !value.supportHeading.trim()) throw new Error('Invalid support heading'); if (context.kind !== 'richContent' || value.figure) throw new Error('Invalid support heading'); }
  if (context.kind === 'question') {
    if (!SPARC_QUESTION_RESPONSE_FORMATS.some(format => format === context.responseFormat)) throw new Error('Invalid question response format');
    if (isSparcChoiceFormat(context.responseFormat)) parseSparcQuestionChoices(value.choices, context.responseFormat);
    else if (value.choices) throw new Error('Unexpected question choices');
    if (context.responseFormat === 'cloze') validateSparcClozeQuestion(value.text);
  } else if (value.choices) throw new Error('Unexpected question metadata');
  return value;
}

