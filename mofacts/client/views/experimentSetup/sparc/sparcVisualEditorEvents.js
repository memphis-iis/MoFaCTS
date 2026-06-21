export function targetAcceptsTextInput(target) {
  const tagName = target?.tagName?.toLowerCase?.() || '';
  return target?.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || Boolean(target?.closest?.('[contenteditable="true"]'));
}

export function readVisualEditorEventValue(event, node) {
  const target = event.target;
  if (!target || !node) {
    return undefined;
  }
  if (node.atomType === 'checkbox') {
    return target.checked === true;
  }
  if (node.atomType === 'dropdown' || node.atomType === 'text-input' || node.atomType === 'fraction-input') {
    return target.value;
  }
  if (node.atomType === 'html-block' || node.atomType === 'message-box') {
    return target.innerHTML;
  }
  return target.textContent;
}

export function createVisualEditorValueBridge(element, handler) {
  const eventNames = ['input', 'keyup', 'focusout', 'change'];
  for (const eventName of eventNames) {
    element.addEventListener(eventName, handler);
  }
  return {
    destroy() {
      for (const eventName of eventNames) {
        element.removeEventListener(eventName, handler);
      }
    },
  };
}
