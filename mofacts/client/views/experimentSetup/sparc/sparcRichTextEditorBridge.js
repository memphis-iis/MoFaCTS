import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Strike } from '@tiptap/extension-strike';
import { Highlight } from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Typography } from '@tiptap/extension-typography';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

export function validHttpsUrl(value) {
  try {
    return new URL(String(value || '').trim()).protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

function requiredRichTextMessage(messages, key) {
  const value = messages?.[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`Missing SPARC rich text message: ${key}`);
  }
  return value;
}

export function createSparcRichTextEditor({ element, content, onUpdate, onRevision, messages = {} }) {
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        strike: false,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Strike,
      Highlight,
      Color,
      TextStyle,
      Typography,
      Subscript,
      Superscript,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: false, allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: requiredRichTextMessage(messages, 'richTextPlaceholder') }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onUpdate(editor);
      onRevision();
    },
    onSelectionUpdate: onRevision,
    onTransaction: onRevision,
  });
}

export function createSparcRichTextController({
  colors,
  getActiveNode,
  getActiveNodeId,
  getHtmlEditorElement,
  getIsRichTextSelected,
  isRichTextNode,
  markChanged,
  normalizeHtml,
  messages = {},
  setErrorText,
  onRevision,
}) {
  let editor = null;
  let savedVisualRichTextRange = null;

  function applyEditorHtmlUpdate(editorInstance) {
    const activeNode = getActiveNode();
    if (!isRichTextNode(activeNode)) {
      return;
    }
    activeNode.value = normalizeHtml(editorInstance.getHTML());
    markChanged();
  }

  function setActiveRichTextHtml(value) {
    const activeNode = getActiveNode();
    if (!isRichTextNode(activeNode)) {
      return;
    }
    activeNode.value = normalizeHtml(value || '<p></p>');
    markChanged();
  }

  function activeVisualRichTextElementForSelection() {
    return activeVisualRichTextElement({
      activeNodeId: getActiveNodeId(),
      isRichTextSelected: getIsRichTextSelected(),
    });
  }

  function rememberVisualRichTextSelection() {
    const nextRange = rememberVisualRichTextSelectionRange({
      activeNodeId: getActiveNodeId(),
      isRichTextSelected: getIsRichTextSelected(),
    });
    if (nextRange) {
      savedVisualRichTextRange = nextRange;
    }
  }

  function setActiveVisualRichTextHtml(element) {
    const activeNode = getActiveNode();
    if (!activeNode || !element) {
      return;
    }
    activeNode.value = normalizeHtml(element.innerHTML || '<p></p>');
    element.innerHTML = activeNode.value;
    if (editor) {
      editor.commands.setContent(activeNode.value || '<p></p>', false);
    }
    markChanged();
    rememberVisualRichTextSelection();
    onRevision();
  }

  function runVisualRichTextCommand(command, value = undefined) {
    const element = activeVisualRichTextElementForSelection();
    const result = runVisualRichTextCommandOnElement({
      element,
      savedRange: savedVisualRichTextRange,
      command,
      value,
      colors,
      messages,
    });
    if (!result.handled) {
      return false;
    }
    if (result.error) {
      setErrorText(result.error);
      return true;
    }
    if (result.updatedHtml) {
      setActiveVisualRichTextHtml(element);
    }
    return true;
  }

  function runRichTextCommand(command, value = undefined) {
    if (!editor || !getIsRichTextSelected()) {
      return;
    }
    if (runVisualRichTextCommand(command, value)) {
      return;
    }
    const result = runSparcRichTextEditorCommand(editor, command, value, colors, messages);
    if (result.error) {
      setErrorText(result.error);
      return;
    }
    applyEditorHtmlUpdate(editor);
    onRevision();
  }

  function richTextCommandActive(command, attrs = undefined) {
    if (!editor || !getIsRichTextSelected()) {
      return false;
    }
    return attrs ? editor.isActive(command, attrs) : editor.isActive(command);
  }

  function richTextAlignmentActive(value) {
    return Boolean(editor?.isActive({ textAlign: value }));
  }

  function updateRichTextSource(value) {
    setActiveRichTextHtml(value);
    if (editor) {
      editor.commands.setContent(getActiveNode()?.value || '<p></p>', false);
    }
  }

  function syncHtmlEditor(node = getActiveNode()) {
    if (!editor || !isRichTextNode(node)) {
      return;
    }
    const current = editor.getHTML();
    const next = normalizeHtml(node.value || '<p></p>');
    if (current !== next) {
      editor.commands.setContent(next, false);
    }
  }

  function ensureHtmlEditor() {
    const element = getHtmlEditorElement();
    if (!element || editor) {
      return;
    }
    editor = createSparcRichTextEditor({
      element,
      content: normalizeHtml(getActiveNode()?.value || '<p></p>'),
      messages,
      onUpdate: applyEditorHtmlUpdate,
      onRevision,
    });
  }

  function maintainHtmlEditor(node = getActiveNode()) {
    if (!isRichTextNode(node)) {
      if (editor) {
        editor.destroy();
        editor = null;
      }
      return;
    }
    ensureHtmlEditor();
  }

  function destroy() {
    editor?.destroy();
    editor = null;
    savedVisualRichTextRange = null;
  }

  return {
    destroy,
    ensureHtmlEditor,
    maintainHtmlEditor,
    rememberVisualRichTextSelection,
    richTextAlignmentActive,
    richTextCommandActive,
    runRichTextCommand,
    syncHtmlEditor,
    updateRichTextSource,
  };
}

export function runSparcRichTextEditorCommand(editor, command, value, colors, messages = {}) {
  const chain = editor.chain().focus();
  if (command === 'bold') {
    chain.toggleBold().run();
  } else if (command === 'italic') {
    chain.toggleItalic().run();
  } else if (command === 'underline') {
    chain.toggleUnderline().run();
  } else if (command === 'strike') {
    chain.toggleStrike().run();
  } else if (command === 'highlight') {
    chain.toggleHighlight().run();
  } else if (command === 'subscript') {
    chain.toggleSubscript().run();
  } else if (command === 'superscript') {
    chain.toggleSuperscript().run();
  } else if (command === 'paragraph') {
    chain.setParagraph().run();
  } else if (command === 'heading') {
    chain.toggleHeading({ level: value }).run();
  } else if (command === 'align') {
    chain.setTextAlign(value).run();
  } else if (command === 'color') {
    const color = colors.find((entry) => entry.token === value);
    if (color) {
      chain.setColor(color.cssValue).run();
    } else {
      chain.unsetColor().run();
    }
  } else if (command === 'bullet-list') {
    chain.toggleBulletList().run();
  } else if (command === 'ordered-list') {
    chain.toggleOrderedList().run();
  } else if (command === 'task-list') {
    chain.toggleTaskList().run();
  } else if (command === 'blockquote') {
    chain.toggleBlockquote().run();
  } else if (command === 'code-block') {
    chain.toggleCodeBlock().run();
  } else if (command === 'horizontal-rule') {
    chain.setHorizontalRule().run();
  } else if (command === 'table') {
    chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  } else if (command === 'table-add-row') {
    chain.addRowAfter().run();
  } else if (command === 'table-add-column') {
    chain.addColumnAfter().run();
  } else if (command === 'table-delete-row') {
    chain.deleteRow().run();
  } else if (command === 'table-delete-column') {
    chain.deleteColumn().run();
  } else if (command === 'table-delete') {
    chain.deleteTable().run();
  } else if (command === 'image') {
    const src = String(value?.src || '').trim();
    if (!validHttpsUrl(src)) {
      return { error: requiredRichTextMessage(messages, 'imageHttpsRequired') };
    }
    chain.setImage({ src, alt: String(value?.alt || '') }).run();
  } else if (command === 'embed') {
    const src = String(value || '').trim();
    if (!validHttpsUrl(src)) {
      return { error: requiredRichTextMessage(messages, 'embedHttpsRequired') };
    }
    chain.insertContent(`<figure class="oli-embed"><iframe src="${src}" title="embed" width="100%" height="360" loading="lazy" allowfullscreen></iframe><figcaption></figcaption></figure>`).run();
  } else if (command === 'undo') {
    chain.undo().run();
  } else if (command === 'redo') {
    chain.redo().run();
  } else if (command === 'link') {
    const href = String(value || '').trim();
    if (href) {
      chain.extendMarkRange('link').setLink({ href }).run();
    } else {
      chain.extendMarkRange('link').unsetLink().run();
    }
  }
  return { error: '' };
}

export function activeVisualRichTextElement({ activeNodeId, isRichTextSelected }) {
  if (!activeNodeId || !isRichTextSelected) {
    return null;
  }
  return Array.from(document.querySelectorAll('.sparc-visual-editor-surface [data-node-id][contenteditable="true"]'))
    .find((element) => element.getAttribute('data-node-id') === activeNodeId) || null;
}

export function selectionIsInsideElement(selection, element) {
  return Boolean(selection?.rangeCount && element?.contains(selection.anchorNode) && element.contains(selection.focusNode));
}

export function rememberVisualRichTextSelectionRange({ activeNodeId, isRichTextSelected }) {
  const element = activeVisualRichTextElement({ activeNodeId, isRichTextSelected });
  const selection = window.getSelection?.();
  if (!element || !selectionIsInsideElement(selection, element)) {
    return null;
  }
  return selection.getRangeAt(0).cloneRange();
}

export function restoreVisualRichTextSelection(element, savedRange) {
  const selection = window.getSelection?.();
  if (!selection || !element) {
    return false;
  }
  if (savedRange && element.contains(savedRange.commonAncestorContainer)) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return true;
  }
  if (!selectionIsInsideElement(selection, element)) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return true;
}

function insertHtmlAtVisualSelection(html) {
  document.execCommand('insertHTML', false, html);
}

function activeTableCell() {
  const selection = window.getSelection?.();
  const node = selection?.anchorNode;
  return (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest?.('td, th') || null;
}

function runVisualTableCommand(command) {
  const cell = activeTableCell();
  if (!cell) {
    return false;
  }
  const row = cell.closest('tr');
  const table = cell.closest('table');
  if (!row || !table) {
    return false;
  }
  if (command === 'table-add-row') {
    const clone = row.cloneNode(true);
    clone.querySelectorAll('th, td').forEach((entry) => {
      entry.innerHTML = '<p></p>';
    });
    row.after(clone);
    return true;
  }
  if (command === 'table-add-column') {
    const index = Array.from(row.children).indexOf(cell);
    table.querySelectorAll('tr').forEach((candidateRow) => {
      const referenceCell = candidateRow.children[index] || candidateRow.lastElementChild;
      const clone = (referenceCell || cell).cloneNode(false);
      clone.innerHTML = '<p></p>';
      referenceCell?.after(clone);
    });
    return true;
  }
  if (command === 'table-delete-row') {
    row.remove();
    if (!table.querySelector('tr')) {
      table.remove();
    }
    return true;
  }
  if (command === 'table-delete-column') {
    const index = Array.from(row.children).indexOf(cell);
    table.querySelectorAll('tr').forEach((candidateRow) => {
      candidateRow.children[index]?.remove();
    });
    if (!table.querySelector('td, th')) {
      table.remove();
    }
    return true;
  }
  if (command === 'table-delete') {
    table.remove();
    return true;
  }
  return false;
}

export function runVisualRichTextCommandOnElement({ element, savedRange, command, value, colors, messages = {} }) {
  if (!element || !restoreVisualRichTextSelection(element, savedRange)) {
    return { handled: false, error: '', updatedHtml: '' };
  }
  element.focus();
  if (command === 'bold') {
    document.execCommand('bold');
  } else if (command === 'italic') {
    document.execCommand('italic');
  } else if (command === 'underline') {
    document.execCommand('underline');
  } else if (command === 'strike') {
    document.execCommand('strikeThrough');
  } else if (command === 'subscript') {
    document.execCommand('subscript');
  } else if (command === 'superscript') {
    document.execCommand('superscript');
  } else if (command === 'paragraph') {
    document.execCommand('formatBlock', false, 'p');
  } else if (command === 'heading') {
    document.execCommand('formatBlock', false, `h${Number(value) || 2}`);
  } else if (command === 'align') {
    const alignCommand = value === 'center' ? 'justifyCenter'
      : value === 'right' ? 'justifyRight'
        : value === 'justify' ? 'justifyFull'
          : 'justifyLeft';
    document.execCommand(alignCommand);
  } else if (command === 'color') {
    const color = colors.find((entry) => entry.token === value);
    if (color) {
      insertHtmlAtVisualSelection(`<span class="sparc-color-${color.token}" data-color="${color.token}">${window.getSelection()?.toString() || ''}</span>`);
    } else {
      document.execCommand('removeFormat');
    }
  } else if (command === 'highlight') {
    insertHtmlAtVisualSelection(`<mark class="sparc-highlight">${window.getSelection()?.toString() || ''}</mark>`);
  } else if (command === 'bullet-list') {
    document.execCommand('insertUnorderedList');
  } else if (command === 'ordered-list') {
    document.execCommand('insertOrderedList');
  } else if (command === 'blockquote') {
    document.execCommand('formatBlock', false, 'blockquote');
  } else if (command === 'code-block') {
    document.execCommand('formatBlock', false, 'pre');
  } else if (command === 'horizontal-rule') {
    document.execCommand('insertHorizontalRule');
  } else if (command === 'link') {
    const href = String(value || '').trim();
    if (href) {
      document.execCommand('createLink', false, href);
    } else {
      document.execCommand('unlink');
    }
  } else if (command === 'image') {
    const src = String(value?.src || '').trim();
    if (!validHttpsUrl(src)) {
      return { handled: true, error: requiredRichTextMessage(messages, 'imageHttpsRequired'), updatedHtml: '' };
    }
    insertHtmlAtVisualSelection(`<img src="${src}" alt="${String(value?.alt || '').replace(/"/g, '&quot;')}">`);
  } else if (command === 'embed') {
    const src = String(value || '').trim();
    if (!validHttpsUrl(src)) {
      return { handled: true, error: requiredRichTextMessage(messages, 'embedHttpsRequired'), updatedHtml: '' };
    }
    insertHtmlAtVisualSelection(`<figure class="oli-embed"><iframe src="${src}" title="embed" width="100%" height="360" loading="lazy" allowfullscreen></iframe><figcaption></figcaption></figure>`);
  } else if (command === 'table') {
    insertHtmlAtVisualSelection('<table><tbody><tr><th><p></p></th><th><p></p></th><th><p></p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>');
  } else if (command.startsWith('table-')) {
    if (!runVisualTableCommand(command)) {
      return { handled: true, error: '', updatedHtml: '' };
    }
  } else if (command === 'task-list') {
    insertHtmlAtVisualSelection('<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" disabled="disabled"> <span>Task</span></label></li></ul>');
  } else {
    return { handled: false, error: '', updatedHtml: '' };
  }
  return { handled: true, error: '', updatedHtml: element.innerHTML || '<p></p>' };
}
