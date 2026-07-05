const JSON_EDITOR_SCRIPT_URL = '/vendor/json-editor/2.15.2/dist/jsoneditor.min.js';

let jsonEditorLoadPromise: Promise<any> | null = null;

function getLoadedJsonEditor() {
  return (globalThis as any).JSONEditor || null;
}

function resolveJsonEditorExport(exportsValue: any) {
  return exportsValue?.JSONEditor || exportsValue?.default || exportsValue || null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (getLoadedJsonEditor()) {
        resolve();
        return;
      }
      existing.remove();
    }

    const previousModule = (globalThis as any).module;
    const previousExports = (globalThis as any).exports;
    const shimModule = { exports: {} as any };

    (globalThis as any).module = shimModule;
    (globalThis as any).exports = shimModule.exports;

    const restoreGlobals = () => {
      if (typeof previousModule === 'undefined') {
        delete (globalThis as any).module;
      } else {
        (globalThis as any).module = previousModule;
      }

      if (typeof previousExports === 'undefined') {
        delete (globalThis as any).exports;
      } else {
        (globalThis as any).exports = previousExports;
      }
    };

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      const exportedJsonEditor = resolveJsonEditorExport(shimModule.exports);
      if (exportedJsonEditor) {
        (globalThis as any).JSONEditor = exportedJsonEditor;
      }
      restoreGlobals();
      resolve();
    };
    script.onerror = () => {
      restoreGlobals();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

export async function ensureJsonEditor(): Promise<any> {
  const existing = getLoadedJsonEditor();
  if (existing) {
    return existing;
  }

  if (!jsonEditorLoadPromise) {
    jsonEditorLoadPromise = loadScript(JSON_EDITOR_SCRIPT_URL).then(() => {
      const loaded = getLoadedJsonEditor();
      if (!loaded) {
        throw new Error('JSONEditor did not initialize after the same-origin asset loaded.');
      }
      return loaded;
    }).catch((error) => {
      jsonEditorLoadPromise = null;
      throw error;
    });
  }

  return jsonEditorLoadPromise;
}
