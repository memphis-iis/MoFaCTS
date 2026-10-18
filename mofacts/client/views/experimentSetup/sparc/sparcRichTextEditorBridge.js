import { Editor } from '@tiptap/core';
import { Mapping } from '@tiptap/pm/transform';
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
import {
  SparcRichTextTable, SparcRichTextTableRow, SparcRichTextTableCell, SparcRichTextTableHeader,
} from './sparcRichTextTable.ts';
import { Image } from '@tiptap/extension-image';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { validateSparcTableSemantics } from '../../experiment/svelte/services/sparcRichHtml.ts';

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

export function createSparcRichTextEditor({ element, content, onUpdate, onRevision, onError, messages = {} }) {
  const issues = validateSparcTableSemantics(content);
  if (issues.length) throw new Error(issues.join('; '));
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
      SparcRichTextTable.configure({ onTableError: onError }),
      SparcRichTextTableRow,
      SparcRichTextTableCell,
      SparcRichTextTableHeader,
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

  function validTableDraft(html) {
    const issues = validateSparcTableSemantics(html);
    if (issues.length) setErrorText(issues.join('; '));
    return issues.length === 0;
  }

  function applyEditorHtmlUpdate(editorInstance) {
    const activeNode = getActiveNode();
    if (!isRichTextNode(activeNode)) {
      return;
    }
    if (!validTableDraft(activeNode.value)) return;
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
    return validTableDraft(activeNode.value);
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
    markChanged();
    if (editor && validTableDraft(activeNode.value)) {
      editor.commands.setContent(activeNode.value || '<p></p>', false);
    }
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
    if (!validTableDraft(getActiveNode()?.value)) return;
    if (runVisualRichTextCommand(command, value)) {
      return;
    }
    const result = runSparcRichTextEditorCommand(editor, command, value, colors, messages);
    if (result.error) {
      setErrorText(result.error);
      return;
    }
    // TipTap's onUpdate owns accepted edits. A rejected table transaction must
    // neither overwrite the current draft nor clear its validation error.
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
    const valid = setActiveRichTextHtml(value);
    if (editor && valid) {
      editor.commands.setContent(getActiveNode()?.value || '<p></p>', false);
    }
  }

  function syncHtmlEditor(node = getActiveNode()) {
    if (!editor || !isRichTextNode(node)) {
      return;
    }
    const current = editor.getHTML();
    const next = normalizeHtml(node.value || '<p></p>');
    if (!validTableDraft(next)) return;
    if (current !== next) {
      editor.commands.setContent(next, false);
    }
  }

  function ensureHtmlEditor() {
    const element = getHtmlEditorElement();
    if (!element || editor) {
      return;
    }
    const content = normalizeHtml(getActiveNode()?.value || '<p></p>');
    if (!validTableDraft(content)) return;
    editor = createSparcRichTextEditor({
      element,
      content,
      messages,
      onUpdate: applyEditorHtmlUpdate,
      onRevision,
      onError: setErrorText,
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

function runVisualTableCommand(command, messages) {
  const cell = activeTableCell();
  const table = cell?.closest('table');
  const row = cell?.closest('tr');
  if (!cell || !table || !row) return { updated: false, error: '' };
  const commands = {
    'table-add-row': 'addRowAfter', 'table-add-column': 'addColumnAfter',
    'table-delete-row': 'deleteRow', 'table-delete-column': 'deleteColumn', 'table-delete': 'deleteTable',
  };
  const editorCommand = commands[command];
  if (!editorCommand) return { updated: false, error: '' };
  const issues = validateSparcTableSemantics(table.outerHTML);
  if (issues.length) return { updated: false, error: issues.join('; ') };
  const rowIndex = Array.from(table.rows).indexOf(row);
  const cellIndex = Array.from(row.cells).indexOf(cell);
  let error = '';
  // Both authoring surfaces use the same grid commands and semantic guard.
  // Transform only this table, so surrounding authored HTML is not reparsed.
  const tableEditor = createSparcRichTextEditor({
    element: document.createElement('div'), content: table.outerHTML, messages,
    onUpdate() {}, onRevision() {}, onError(message) { error = message; },
  });
  try {
    const modelTable = tableEditor.state.doc.firstChild;
    const cellSources = [];
    modelTable.forEach((modelRow, rowOffset, modelRowIndex) => {
      modelRow.forEach((_modelCell, cellOffset, modelCellIndex) => {
        cellSources.push({ position: 2 + rowOffset + cellOffset,
          html: table.rows[modelRowIndex].cells[modelCellIndex].innerHTML });
      });
    });
    const mapping = new Mapping();
    tableEditor.on('transaction', ({ transaction, appendedTransactions }) => {
      for (const applied of [transaction, ...appendedTransactions]) mapping.appendMapping(applied.mapping);
    });
    let position = 2;
    for (let index = 0; index < rowIndex; index++) position += modelTable.child(index).nodeSize;
    const modelRow = modelTable.child(rowIndex);
    for (let index = 0; index < cellIndex; index++) position += modelRow.child(index).nodeSize;
    tableEditor.commands.setTextSelection(position + 2);
    const accepted = tableEditor.commands[editorCommand]();
    if (!accepted || error) return { updated: false, error };
    const replacement = document.createElement('template');
    replacement.innerHTML = tableEditor.getHTML();
    const updatedTable = replacement.content.querySelector('table');
    if (updatedTable) {
      const survivingCells = new Map();
      tableEditor.state.doc.firstChild.forEach((modelRow, rowOffset, modelRowIndex) => {
        modelRow.forEach((_modelCell, cellOffset, modelCellIndex) => {
          survivingCells.set(2 + rowOffset + cellOffset, updatedTable.rows[modelRowIndex].cells[modelCellIndex]);
        });
      });
      for (const source of cellSources) {
        // Map inside the opening cell token: setNodeMarkup changes that token
        // for spans, while the authored cell contents survive unchanged.
        const mapped = mapping.mapResult(source.position + 1, 1);
        if (!mapped.deleted) {
          const survivingCell = survivingCells.get(mapped.pos - 1);
          if (!survivingCell) return { updated: false, error: 'SPARC table edit could not preserve an authored cell; no changes were applied.' };
          survivingCell.innerHTML = source.html;
        }
      }
      table.replaceWith(updatedTable);
    }
    else table.remove();
    return { updated: true, error: '' };
  } finally {
    tableEditor.destroy();
  }
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
    const result = runVisualTableCommand(command, messages);
    if (!result.updated) {
      return { handled: true, error: result.error, updatedHtml: '' };
    }
  } else if (command === 'task-list') {
    insertHtmlAtVisualSelection('<ul data-type="taskList"><li data-type="taskItem"><label><input type="checkbox" disabled="disabled"> <span>Task</span></label></li></ul>');
  } else {
    return { handled: false, error: '', updatedHtml: '' };
  }
  return { handled: true, error: '', updatedHtml: element.innerHTML || '<p></p>' };
}
