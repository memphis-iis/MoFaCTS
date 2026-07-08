export interface TextInputKeydownLike {
  key?: string;
  isComposing?: boolean;
  repeat?: boolean;
}

export function shouldSubmitTextInputOnKeydown(event: TextInputKeydownLike): boolean {
  return event.key === 'Enter' && event.isComposing !== true;
}
