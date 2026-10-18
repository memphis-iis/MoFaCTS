import { DOMSerializer } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { CommandProps } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { isInTable, selectedRect, TableMap } from '@tiptap/pm/tables';
import { Table, TableView } from '@tiptap/extension-table';
import type { TableOptions } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import type { EditorView } from '@tiptap/pm/view';
import DOMPurify from 'dompurify';
import { sanitizeSparcRichHtml, validateSparcTableSemantics } from '../../experiment/svelte/services/sparcRichHtml';

type TableSection = { tag: string; index: number };
type StructuralCommand = 'addColumnBefore' | 'addColumnAfter' | 'deleteColumn' | 'addRowBefore' | 'addRowAfter';

// The stock commands own the table grid. These metadata updates run in their
// transaction, so undo/redo also restores the authored column/row groups.
function updateTableGroups(command: StructuralCommand, props: CommandProps, run: () => boolean): boolean {
  if (!isInTable(props.state)) return run();
  const rect = selectedRect(props.state);
  const mappingStart = props.tr.mapping.maps.length;
  const result = run();
  if (!result || !props.dispatch) return result;
  if (command === 'deleteColumn' && rect.left === 0 && rect.right === rect.map.width) return result;
  const tablePosition = props.tr.mapping.slice(mappingStart).map(rect.tableStart - 1);
  const table = props.tr.doc.nodeAt(tablePosition);
  if (!table || table.type.spec.tableRole !== 'table') return result;
  if (command.startsWith('addColumn') || command === 'deleteColumn') {
    const groups: number[] | null = rect.table.attrs.columnGroups;
    if (!groups) return result;
    let offset = 0;
    const nextGroups = groups.map(span => {
      const start = offset;
      offset += span;
      if (command === 'deleteColumn') return span - Math.max(0, Math.min(offset, rect.right) - Math.max(start, rect.left));
      // At a boundary the new column joins the selected column's group. This
      // shifts the boundary without moving any surviving cell to another group.
      const anchor = command === 'addColumnBefore' ? rect.left : rect.right - 1;
      return span + (start <= anchor && anchor < offset ? 1 : 0);
    }).filter(span => span > 0);
    props.tr.setNodeMarkup(tablePosition, undefined, { ...table.attrs, columnGroups: nextGroups });
    return result;
  }
  const rowIndex = command === 'addRowBefore' ? rect.top : rect.bottom;
  const row = table.child(rowIndex);
  const anchor = rect.table.child(command === 'addRowBefore' ? rect.top : rect.bottom - 1);
  let section: TableSection | null = anchor.attrs.tableSection;
  const dataRow = Array.from({ length: row.childCount }, (_, index) => row.child(index))
    .some(cell => cell.type.spec.tableRole === 'cell');
  if (dataRow && section?.tag === 'thead') {
    const adjacent = rowIndex < rect.table.childCount ? rect.table.child(rowIndex).attrs.tableSection : null;
    section = adjacent?.tag === 'tbody' ? adjacent : { tag: 'tbody', index: -1 - rowIndex };
  }
  let rowPosition = tablePosition + 1;
  for (let index = 0; index < rowIndex; index++) rowPosition += table.child(index).nodeSize;
  props.tr.setNodeMarkup(rowPosition, undefined, { ...row.attrs, tableSection: section });
  return result;
}

function documentTableIssues(doc: ProseMirrorNode): string[] {
  const container = document.createElement('div');
  container.appendChild(DOMSerializer.fromSchema(doc.type.schema).serializeFragment(doc.content));
  const issues = validateSparcTableSemantics(container.innerHTML);
  doc.descendants(node => {
    if (node.type.spec.tableRole !== 'table' || !node.attrs.columnGroups) return;
    const span = (node.attrs.columnGroups as number[]).reduce((total, value) => total + value, 0);
    if (span > TableMap.get(node).width) issues.push('SPARC rich HTML: column groups exceed the table grid');
  });
  return issues;
}

// Keep the stock tableRow+ model: table editing and resizing require direct rows.
// Captions and HTML grouping are serialization metadata, not extra table cells.
function captionElement(node: ProseMirrorNode): HTMLTableCaptionElement | null {
  if (node.attrs.caption === null) return null;
  const container = document.createElement('template');
  container.innerHTML = sanitizeSparcRichHtml(`<table><caption>${node.attrs.caption}</caption></table>`, DOMPurify.sanitize.bind(DOMPurify));
  return container.content.querySelector('caption');
}

class SparcTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number, view?: EditorView, attributes: Record<string, unknown> = {}) {
    super(node, cellMinWidth, view, attributes);
    this.updateCaption();
  }

  private updateCaption(): void {
    this.table.caption?.remove();
    const caption = captionElement(this.node);
    if (caption) {
      // The existing HTML source field edits captions; table cell commands must
      // not treat the caption as an extra row or silently discard its content.
      caption.setAttribute('contenteditable', 'false');
      this.table.prepend(caption);
    }
  }

  update(node: ProseMirrorNode): boolean {
    if (!super.update(node)) return false;
    this.updateCaption();
    return true;
  }
}

export const SparcRichTextTable = Table.extend<TableOptions & { onTableError: ((message: string) => void) | null }>({
  addOptions() {
    return { ...this.parent!(), onTableError: null as ((message: string) => void) | null };
  },
  addCommands() {
    const parent = this.parent!();
    const wrapped = {} as Pick<typeof parent, StructuralCommand>;
    for (const command of ['addColumnBefore', 'addColumnAfter', 'deleteColumn', 'addRowBefore', 'addRowAfter'] as const) {
      wrapped[command] = () => props => updateTableGroups(command, props, () => parent[command]!()(props));
    }
    return { ...parent, ...wrapped };
  },
  addProseMirrorPlugins() {
    const onTableError = this.options.onTableError as ((message: string) => void) | null;
    if (!onTableError) throw new Error('SPARC table editing requires its authoring error boundary');
    return [...(this.parent?.() || []), new Plugin({
      filterTransaction: transaction => {
        if (!transaction.docChanged) return true;
        const issues = documentTableIssues(transaction.doc);
        if (!issues.length) return true;
        // Reject the whole transaction: never guess a replacement for a removed
        // header, duplicate a header ID, or publish invalid HTML to live preview.
        onTableError(issues.join('; '));
        return false;
      },
    })];
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        rendered: false,
        parseHTML: (element: HTMLElement) => {
          const caption = element.querySelector(':scope > caption');
          return caption ? caption.innerHTML : null;
        },
      },
      columnGroups: {
        default: null,
        rendered: false,
        parseHTML: (element: HTMLElement) => {
          const groups = Array.from(element.querySelectorAll(':scope > colgroup'));
          return groups.length ? groups.map(group => {
            const columns = Array.from(group.querySelectorAll(':scope > col'));
            return columns.length
              ? columns.reduce((total, column) => total + (column as HTMLTableColElement).span, 0)
              : (group as HTMLTableColElement).span;
          }) : null;
        },
      },
    };
  },
  parseHTML() {
    return [{
      tag: 'table',
      contentElement: (element: HTMLElement) => {
        const content = element.cloneNode(true) as HTMLElement;
        content.querySelector(':scope > caption')?.remove();
        return content;
      },
    }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const rendered = DOMSerializer.renderSpec(document, this.parent!({ node, HTMLAttributes }));
    const root = rendered.dom as HTMLElement;
    const table = root.tagName === 'TABLE' ? root as HTMLTableElement : root.querySelector('table')!;
    const caption = captionElement(node);
    if (caption) table.prepend(caption);
    if (node.attrs.columnGroups) {
      table.querySelectorAll(':scope > colgroup').forEach(group => group.remove());
      for (const span of node.attrs.columnGroups as number[]) {
        const group = document.createElement('colgroup');
        group.span = span;
        table.appendChild(group);
      }
    }
    table.querySelector(':scope > tbody')?.remove();
    const serializer = DOMSerializer.fromSchema(node.type.schema);
    let section: HTMLTableSectionElement | undefined;
    let previousGroup: TableSection | undefined;
    node.forEach(row => {
      const group = row.attrs.tableSection ?? { tag: 'tbody', index: -1 };
      if (!section || group.tag !== previousGroup?.tag || group.index !== previousGroup?.index) {
        section = document.createElement(group.tag) as HTMLTableSectionElement;
        table.appendChild(section);
      }
      section.appendChild(serializer.serializeNode(row));
      previousGroup = group;
    });
    return root;
  },
}).configure({ resizable: true, View: SparcTableView });

export const SparcRichTextTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableSection: {
        default: null,
        rendered: false,
        parseHTML: (row: HTMLElement) => {
          const section = row.parentElement;
          if (!section || !['THEAD', 'TBODY', 'TFOOT'].includes(section.tagName)) return null;
          const table = section.parentElement!;
          return { tag: section.tagName.toLowerCase(), index: Array.from(table.children).indexOf(section) };
        },
      },
    };
  },
});

export const SparcRichTextTableCell = TableCell.extend({
  addAttributes() { return { ...this.parent?.(), headers: { default: null } }; },
});

export const SparcRichTextTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), id: { default: null }, scope: { default: null }, headers: { default: null } };
  },
});
