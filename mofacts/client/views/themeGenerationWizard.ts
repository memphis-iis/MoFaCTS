import { Meteor } from 'meteor/meteor';
import { ReactiveDict } from 'meteor/reactive-dict';
import { Template } from 'meteor/templating';
import {
  generateTheme,
  getGeneratedThemeDiagnosticDetails,
  type GeneratedTheme,
} from '../lib/themeGenerator';
import { parseThemeColor, parseThemeColorList } from '../lib/themeColorMetrics';
import { getPaletteStats, parsePaletteSlotValues, type PaletteExpansionOptions } from '../lib/themePaletteExpansion';
import './themeGenerationWizard.html';

declare const DynamicSettings: any;

type PaletteSlot = {
  value: string;
  label: string;
};

type WizardState = {
  open: boolean;
  name: string;
  baseThemeId: string;
  slots: PaletteSlot[];
  polarity: 'light' | 'dark';
  densityPercent: number;
  contrastPriority: number;
  expansion: PaletteExpansionOptions;
  error: string;
  status: string;
  skippedCssValues: string[];
  generated: GeneratedTheme | null;
};

const DEFAULT_EXPANSION: PaletteExpansionOptions = {
  allowTints: true,
  allowShades: true,
  allowMutedVariants: true,
  allowGeneratedCompanions: true,
  maxGeneratedPerColor: 3,
};

const DEFAULT_SLOTS: PaletteSlot[] = [
  { value: '#7ED957', label: 'Accent' },
  { value: '#F2F2F2', label: 'Surface' },
  { value: '#000000', label: 'Text' },
  { value: '#FF0000', label: 'Feedback' },
];

function getThemeLibrary() {
  const library = DynamicSettings.findOne({ key: 'themeLibrary' });
  return Array.isArray(library?.value) ? library.value : [];
}

function getServerActiveTheme() {
  const setting = DynamicSettings.findOne({ key: 'customTheme' });
  return setting?.value || null;
}

function cloneSlots(slots: PaletteSlot[]): PaletteSlot[] {
  return slots.map((slot) => ({ ...slot }));
}

function defaultWizardName() {
  const date = new Date();
  return `Generated Theme ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function initialState(): WizardState {
  return {
    open: false,
    name: defaultWizardName(),
    baseThemeId: '',
    slots: cloneSlots(DEFAULT_SLOTS),
    polarity: 'light',
    densityPercent: 100,
    contrastPriority: 0.5,
    expansion: { ...DEFAULT_EXPANSION },
    error: '',
    status: '',
    skippedCssValues: [],
    generated: null,
  };
}

type ThemeWizardTemplateInstance = Blaze.TemplateInstance & { state?: ReactiveDict<any> };

function getState(instance: ThemeWizardTemplateInstance): WizardState {
  const state = instance.state?.get('wizardState');
  if (!state) {
    throw new Error('Theme generation wizard state is not initialized.');
  }
  return state;
}

function setState(instance: ThemeWizardTemplateInstance, updater: (state: WizardState) => WizardState) {
  instance.state?.set('wizardState', updater(getState(instance)));
}

function slotsFromProperties(properties: Record<string, unknown>): PaletteSlot[] {
  const values = [
    ['Accent', properties.app_accent_color],
    ['Surface', properties.app_background_color],
    ['Text', properties.app_text_color],
    ['Feedback', properties.feedback_error_color],
  ];
  return values.map(([label, value]) => ({
    label: String(label),
    value: typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value.trim())
      ? value.trim().toUpperCase()
      : '#000000',
  }));
}

function defaultThemeSlots(): PaletteSlot[] {
  const defaultTheme = getThemeLibrary().find((theme: any) => theme?.id === 'mofacts-default');
  if (!defaultTheme?.properties) {
    throw new Error('MoFaCTS Default theme is not available in the theme library.');
  }
  return slotsFromProperties(defaultTheme.properties);
}

function getSelectedBaseTheme(state: WizardState) {
  const activeTheme = getServerActiveTheme();
  const baseThemeId = state.baseThemeId || activeTheme?.activeThemeId;
  if (!baseThemeId) {
    throw new Error('A selected base theme is required for explicit inheritance.');
  }

  const selected = getThemeLibrary().find((theme: any) => theme?.id === baseThemeId);
  if (selected?.properties) {
    return selected;
  }

  if (activeTheme?.activeThemeId === baseThemeId && activeTheme.properties) {
    return activeTheme;
  }

  throw new Error(`Selected base theme "${baseThemeId}" is not available.`);
}

function buildGeneratedTheme(instance: ThemeWizardTemplateInstance): GeneratedTheme {
  const state = getState(instance);
  const baseTheme = getSelectedBaseTheme(state);
  const palette = parsePaletteSlotValues(state.slots.map((slot) => slot.value));
  return generateTheme({
    name: state.name,
    baseThemeId: baseTheme.id || baseTheme.activeThemeId,
    baseProperties: baseTheme.properties,
    palette,
    polarity: state.polarity,
    densityPercent: state.densityPercent,
    contrastPriority: state.contrastPriority,
    expansion: state.expansion,
    skippedCssValues: state.skippedCssValues,
  });
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function parsePaletteJson(text: string): PaletteSlot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error('Palette JSON is not valid JSON.');
  }

  const rawColors = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { colors?: unknown }).colors)
      ? (parsed as { colors: unknown[] }).colors
      : null;
  if (!rawColors) {
    throw new Error('Palette JSON must be an array of colors or an object with a colors array.');
  }

  const slots = rawColors.map((entry, index): PaletteSlot => {
    if (typeof entry === 'string') {
      return { value: parseThemeColor(entry).hex, label: '' };
    }
    if (entry && typeof entry === 'object') {
      const record = entry as { color?: unknown; value?: unknown; hex?: unknown; label?: unknown; name?: unknown };
      const rawColor = record.color || record.value || record.hex;
      const label = record.label || record.name || `Color ${index + 1}`;
      return {
        value: parseThemeColor(rawColor).hex,
        label: typeof label === 'string' ? label : `Color ${index + 1}`,
      };
    }
    throw new Error(`Palette JSON color ${index + 1} is not a supported color entry.`);
  });

  if (slots.length < 2) {
    throw new Error('Palette JSON must provide at least two valid colors.');
  }
  return slots;
}

function previewViewModel(generated: GeneratedTheme, contrastPriority: number) {
  const properties = generated.properties;
  const details = getGeneratedThemeDiagnosticDetails(
    generated.properties,
    Number(String(properties.app_density_scale || '1')) * 100,
    contrastPriority,
  );
  return {
    previewStyle: `background:${properties.app_background_color};color:${properties.app_text_color};font-size:${properties.app_font_size_base};`,
    navStyle: `background:${properties.navigation_surface_color};color:${properties.navigation_text_color};`,
    cardStyle: `background:${properties.learning_card_surface_color};color:${properties.app_text_color};`,
    stimulusStyle: `background:${properties.learning_card_stimulus_surface_color};color:${properties.app_text_color};`,
    buttonStyle: `background:${properties.app_primary_action_surface_color};color:${properties.app_primary_action_text_color};min-height:${properties.app_button_height};`,
    correctStyle: `color:${properties.feedback_correct_color};`,
    errorStyle: `color:${properties.feedback_error_color};`,
    trackStyle: `background:${properties.practice_menu_accuracy_bar_track_color};`,
    fillStyle: `background:${properties.practice_menu_accuracy_bar_fill_color};width:68%;`,
    readability: formatPercent(generated.scores.readability),
    surfaceSeparation: formatPercent(generated.scores.surfaceSeparation),
    feedbackDistinctiveness: formatPercent(generated.scores.feedbackDistinctiveness),
    paletteFidelity: formatPercent(generated.scores.paletteFidelity),
    aaCount: generated.diagnostics.aaCount,
    aaaCount: generated.diagnostics.aaaCount,
    explanation: generated.explanation,
    contrastRows: details.contrastRows,
    distinctnessRows: details.distinctnessRows,
    luminanceRows: details.luminanceRows,
    colorRows: details.colorRows,
  };
}

Template.themeGenerationWizard.onCreated(function(this: ThemeWizardTemplateInstance) {
  this.state = new ReactiveDict();
  this.state.set('wizardState', initialState());
});

Template.themeGenerationWizard.helpers({
  wizardOpen() {
    return getState(Template.instance() as ThemeWizardTemplateInstance).open;
  },
  wizardToggleLabel() {
    return getState(Template.instance() as ThemeWizardTemplateInstance).open ? 'Hide' : 'Generate Theme';
  },
  wizardName() {
    return getState(Template.instance() as ThemeWizardTemplateInstance).name;
  },
  paletteSlots() {
    const state = getState(Template.instance() as ThemeWizardTemplateInstance);
    return state.slots.map((slot, index) => ({
      ...slot,
      index,
      removeAttrs: state.slots.length <= 2 ? { disabled: true, 'aria-disabled': true } : {},
    }));
  },
  baseThemes() {
    const activeTheme = getServerActiveTheme();
    const state = getState(Template.instance() as ThemeWizardTemplateInstance);
    const selectedId = state.baseThemeId || activeTheme?.activeThemeId;
    return getThemeLibrary().map((theme: any) => ({
      id: theme.id,
      name: theme.metadata?.name || theme.properties?.themeName || theme.id,
      attrs: selectedId === theme.id ? { selected: true } : {},
    }));
  },
  polarityAttrs(value: string) {
    return getState(Template.instance() as ThemeWizardTemplateInstance).polarity === value ? { selected: true } : {};
  },
  densityPercent() {
    return getState(Template.instance() as ThemeWizardTemplateInstance).densityPercent;
  },
  contrastPriorityPercent() {
    return Math.round(getState(Template.instance() as ThemeWizardTemplateInstance).contrastPriority * 100);
  },
  expansionAttrs(key: keyof PaletteExpansionOptions) {
    return getState(Template.instance() as ThemeWizardTemplateInstance).expansion[key] === true ? { checked: true } : {};
  },
  paletteStats() {
    try {
      const state = getState(Template.instance() as ThemeWizardTemplateInstance);
      const stats = getPaletteStats(parsePaletteSlotValues(state.slots.map((slot) => slot.value)));
      return {
        ...stats,
        medianLuminance: stats.medianLuminance.toFixed(3),
      };
    } catch (_error) {
      return null;
    }
  },
  wizardError() {
    return getState(Template.instance() as ThemeWizardTemplateInstance).error;
  },
  wizardStatus() {
    return getState(Template.instance() as ThemeWizardTemplateInstance).status;
  },
  generatedPreview() {
    const state = getState(Template.instance() as ThemeWizardTemplateInstance);
    return state.generated ? previewViewModel(state.generated, state.contrastPriority) : null;
  },
});

Template.themeGenerationWizard.events({
  'click .toggle-theme-wizard'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    setState(instance, (state) => ({ ...state, open: !state.open, error: '', status: '' }));
  },
  'input .theme-wizard-name'(event: Event, instance: ThemeWizardTemplateInstance) {
    const value = (event.currentTarget as HTMLInputElement).value;
    setState(instance, (state) => ({ ...state, name: value, generated: null }));
  },
  'input .theme-wizard-slot-color, input .theme-wizard-slot-hex, input .theme-wizard-slot-label'(event: Event, instance: ThemeWizardTemplateInstance) {
    const target = event.currentTarget as HTMLInputElement;
    const slotRoot = target.closest('.theme-wizard-palette-slot') as HTMLElement | null;
    const index = Number(slotRoot?.dataset.index);
    if (!Number.isInteger(index)) {
      throw new Error('Theme wizard palette slot is missing its index.');
    }
    setState(instance, (state) => {
      const slots = cloneSlots(state.slots);
      const slot = slots[index];
      if (!slot) {
        throw new Error(`Theme wizard palette slot ${index} does not exist.`);
      }
      if (target.classList.contains('theme-wizard-slot-label')) {
        slot.label = target.value;
      } else {
        slot.value = target.value.trim();
      }
      return { ...state, slots, generated: null, error: '' };
    });
  },
  'click .theme-wizard-add-color'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    setState(instance, (state) => ({
      ...state,
      slots: [...state.slots, { value: '#FFFFFF', label: '' }],
      generated: null,
      status: state.slots.length >= 8 ? 'More than eight colors can make palette role assignment less predictable.' : '',
    }));
  },
  'change .theme-wizard-base-theme'(event: Event, instance: ThemeWizardTemplateInstance) {
    const baseThemeId = (event.currentTarget as HTMLSelectElement).value;
    setState(instance, (state) => ({ ...state, baseThemeId, generated: null, error: '' }));
  },
  'click .theme-wizard-remove-color'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    const index = Number((event.currentTarget as HTMLElement).dataset.index);
    setState(instance, (state) => {
      if (state.slots.length <= 2) {
        return { ...state, error: 'At least two palette colors are required.' };
      }
      return { ...state, slots: state.slots.filter((_slot, slotIndex) => slotIndex !== index), generated: null, error: '' };
    });
  },
  'click .theme-wizard-from-active'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    const activeTheme = getServerActiveTheme();
    if (!activeTheme?.properties) {
      setState(instance, (state) => ({ ...state, error: 'No active theme is available to extract from.' }));
      return;
    }
    setState(instance, (state) => ({ ...state, slots: slotsFromProperties(activeTheme.properties), error: '', generated: null }));
  },
  'click .theme-wizard-from-default'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    try {
      const slots = defaultThemeSlots();
      setState(instance, (state) => ({ ...state, slots, error: '', generated: null }));
    } catch (error: unknown) {
      setState(instance, (state) => ({ ...state, error: error instanceof Error ? error.message : String(error) }));
    }
  },
  'change .theme-wizard-json-upload'(event: Event, instance: ThemeWizardTemplateInstance) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 1024 * 1024) {
      setState(instance, (state) => ({ ...state, error: 'Palette JSON files must be smaller than 1MB.' }));
      input.value = '';
      return;
    }
    file.text()
      .then((text) => {
        const slots = parsePaletteJson(text);
        setState(instance, (state) => ({ ...state, slots, skippedCssValues: [], error: '', status: `Loaded ${slots.length} colors from palette JSON.`, generated: null }));
      })
      .catch((error: unknown) => {
        setState(instance, (state) => ({ ...state, error: error instanceof Error ? error.message : String(error), status: '' }));
      })
      .finally(() => {
        input.value = '';
      });
  },
  'click .theme-wizard-apply-paste'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    const textarea = instance.find('.theme-wizard-paste') as HTMLTextAreaElement | null;
    const parsed = parseThemeColorList(textarea?.value || '');
    setState(instance, (state) => ({
      ...state,
      slots: parsed.colors.map((color) => ({ value: color.hex, label: '' })),
      skippedCssValues: parsed.skipped,
      error: parsed.colors.length < 2 ? 'Paste at least two supported hex or rgb() colors.' : '',
      status: parsed.skipped.length ? `Skipped unsupported CSS values: ${parsed.skipped.join(', ')}` : '',
      generated: null,
    }));
  },
  'change .theme-wizard-polarity'(event: Event, instance: ThemeWizardTemplateInstance) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value !== 'light' && value !== 'dark') {
      throw new Error(`Unsupported theme polarity: ${value}`);
    }
    setState(instance, (state) => ({ ...state, polarity: value, generated: null }));
  },
  'input .theme-wizard-contrast'(event: Event, instance: ThemeWizardTemplateInstance) {
    const value = Number((event.currentTarget as HTMLInputElement).value) / 100;
    setState(instance, (state) => ({ ...state, contrastPriority: value, generated: null }));
  },
  'input .theme-wizard-density'(event: Event, instance: ThemeWizardTemplateInstance) {
    setState(instance, (state) => ({ ...state, densityPercent: Number((event.currentTarget as HTMLInputElement).value), generated: null }));
  },
  'change .theme-wizard-expansion'(event: Event, instance: ThemeWizardTemplateInstance) {
    const target = event.currentTarget as HTMLInputElement;
    const key = target.dataset.key as keyof PaletteExpansionOptions | undefined;
    if (!key || key === 'maxGeneratedPerColor') {
      throw new Error('Theme wizard expansion checkbox is missing a valid key.');
    }
    setState(instance, (state) => ({
      ...state,
      expansion: { ...state.expansion, [key]: target.checked },
      generated: null,
    }));
  },
  'click .theme-wizard-preview-generate'(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    try {
      const generated = buildGeneratedTheme(instance);
      setState(instance, (state) => ({ ...state, generated, error: '', status: 'Preview generated. No server changes made yet.' }));
    } catch (error: unknown) {
      setState(instance, (state) => ({ ...state, generated: null, error: error instanceof Error ? error.message : String(error), status: '' }));
    }
  },
  'click .theme-wizard-create-activate': async function(event: Event, instance: ThemeWizardTemplateInstance) {
    event.preventDefault();
    try {
      const generated = buildGeneratedTheme(instance);
      const state = getState(instance);
      const baseTheme = getSelectedBaseTheme(state);
      const activatedTheme = await (Meteor as any).callAsync('createThemeFromBase', {
        name: generated.properties.themeName,
        baseThemeId: baseTheme.id || baseTheme.activeThemeId,
        properties: generated.properties,
        activate: true,
      });
      setState(instance, (state) => ({
        ...state,
        generated,
        error: '',
        status: `Generated and activated ${activatedTheme?.metadata?.name || generated.properties.themeName}.`,
      }));
    } catch (error: unknown) {
      setState(instance, (state) => ({ ...state, error: error instanceof Error ? error.message : String(error), status: '' }));
    }
  },
});
