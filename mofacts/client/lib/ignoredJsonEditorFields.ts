/** Keep ignored metadata opaque: no input, coercion, default, or validation. */
export function configureIgnoredJsonEditorFields(jsonEditor: any): void {
  if (jsonEditor.defaults.editors.ignored) return;

  class IgnoredEditor extends jsonEditor.AbstractEditor {
    getDefault() { return undefined; }
    build() { this.container.hidden = true; }
    setValue(value: unknown) { this.value = value; }
    getValue() { return this.value; }
    refreshValue() {}
  }

  const ObjectEditor = jsonEditor.defaults.editors.object;
  class ObjectWithIgnoredFields extends ObjectEditor {
    getValue() {
      const value = super.getValue();
      if (!value) return value;
      // The bundled object editor prunes empty strings and objects globally.
      // Ignored fields must round-trip those values too, including on reorder.
      for (const [key, editor] of Object.entries(this.editors || {}) as Array<[string, any]>) {
        if (editor.schema?.format === 'ignored' && editor.isActive()) {
          const ignoredValue = editor.getValue();
          if (ignoredValue !== undefined) value[key] = ignoredValue;
        }
      }
      return value;
    }
  }

  jsonEditor.defaults.editors.ignored = IgnoredEditor;
  jsonEditor.defaults.editors.object = ObjectWithIgnoredFields;
  jsonEditor.defaults.resolvers.unshift((schema: Record<string, unknown>) =>
    schema.format === 'ignored' ? 'ignored' : undefined
  );
}
