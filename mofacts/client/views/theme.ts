import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';
import { ReactiveVar } from 'meteor/reactive-var';
import {
    isThemeLengthProperty,
    isThemeDensityScaleProperty,
    isValidThemeDensityScale,
    isThemeTransitionProperty,
    isValidThemeCssLength,
    isValidThemeCssTime,
    normalizeThemePropertyValue,
    themeEditorDisplayValue,
} from '../../common/themePropertyNormalization';
import { clientConsole } from '../lib/clientLogger';
import './themeGenerationWizard';
import './theme.html';

declare const DynamicSettings: any;
declare const $: any;

const THEME_FONT_STYLESHEET_LINK_ID = 'mofacts-theme-font-stylesheet';
const THEME_IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const HOME_UNDERLAY_MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_ICON_CONTRAST_RATIO = 3;

type RgbColor = {
    r: number;
    g: number;
    b: number;
};

function getPixelChannel(data: Uint8ClampedArray, index: number) {
    const value = data[index];
    if (value === undefined) {
        throw new Error(`Missing pixel channel at index ${index}`);
    }
    return value;
}

function srgbChannelToLinear(channel: number) {
    const normalized = channel / 255;
    return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(color: RgbColor) {
    return (
        0.2126 * srgbChannelToLinear(color.r) +
        0.7152 * srgbChannelToLinear(color.g) +
        0.0722 * srgbChannelToLinear(color.b)
    );
}

function getContrastRatio(luminanceA: number, luminanceB: number) {
    const lighter = Math.max(luminanceA, luminanceB);
    const darker = Math.min(luminanceA, luminanceB);
    return (lighter + 0.05) / (darker + 0.05);
}

function toTwoDigitHex(channel: number) {
    return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0').toUpperCase();
}

function normalizeColorPickerValue(rawValue: unknown): string | null {
    if (typeof rawValue !== 'string') {
        return null;
    }

    const value = rawValue.trim();
    const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
    if (shortHex) {
        const channels = shortHex[1];
        if (!channels) {
            throw new Error(`Invalid short hex color: ${value}`);
        }
        return `#${channels[0]}${channels[0]}${channels[1]}${channels[1]}${channels[2]}${channels[2]}`.toUpperCase();
    }

    if (/^#[0-9a-f]{6}$/i.test(value)) {
        return value.toUpperCase();
    }

    try {
        const parsed = parseCssColor(value);
        return `#${toTwoDigitHex(parsed.r)}${toTwoDigitHex(parsed.g)}${toTwoDigitHex(parsed.b)}`;
    } catch (_err) {
        return null;
    }
}

function syncThemeColorPicker(inputEl: HTMLInputElement, themeProperties: Record<string, unknown>) {
    const propId = inputEl.getAttribute('data-id');
    if (!propId) {
        return;
    }

    const colorValue = normalizeColorPickerValue(themeProperties[propId]);
    if (!colorValue) {
        inputEl.disabled = true;
        inputEl.title = 'This value is not compatible with the native color picker. Edit the text field.';
        return;
    }

    inputEl.disabled = false;
    inputEl.title = '';
    inputEl.value = colorValue;
}

function syncThemeColorPickers(root: ParentNode = document) {
    const theme = getServerActiveTheme();
    const themeProperties = theme?.properties;
    if (!themeProperties) {
        return;
    }

    root.querySelectorAll<HTMLInputElement>('.currentThemePropColor').forEach((inputEl) => {
        syncThemeColorPicker(inputEl, themeProperties);
    });
}

function parseCssColor(value: string): RgbColor {
    if (typeof CSS !== 'undefined' && !CSS.supports('color', value)) {
        throw new Error(`Invalid icon background color: ${value}`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Unable to create canvas context for color parsing');
    }

    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);

    const colorData = ctx.getImageData(0, 0, 1, 1).data;
    return {
        r: getPixelChannel(colorData, 0),
        g: getPixelChannel(colorData, 1),
        b: getPixelChannel(colorData, 2)
    };
}

function getImageRelativeLuminance(img: HTMLImageElement) {
    const sampleSize = 96;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
        throw new Error('Unable to create canvas context for icon contrast sampling');
    }

    ctx.clearRect(0, 0, sampleSize, sampleSize);
    const scale = Math.min(sampleSize / img.width, sampleSize / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const dx = (sampleSize - drawWidth) / 2;
    const dy = (sampleSize - drawHeight) / 2;
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

    const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
    let weightedLuminance = 0;
    let alphaWeight = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const alpha = getPixelChannel(pixels, i + 3) / 255;
        if (alpha <= 0.05) {
            continue;
        }

        weightedLuminance += getRelativeLuminance({
            r: getPixelChannel(pixels, i),
            g: getPixelChannel(pixels, i + 1),
            b: getPixelChannel(pixels, i + 2)
        }) * alpha;
        alphaWeight += alpha;
    }

    if (alphaWeight === 0) {
        throw new Error('Logo image has no visible pixels for icon contrast sampling');
    }

    return weightedLuminance / alphaWeight;
}

function getContrastingIconBackgroundColor(img: HTMLImageElement, preferredBackgroundColor: string) {
    const preferred = parseCssColor(preferredBackgroundColor);
    const logoLuminance = getImageRelativeLuminance(img);
    const preferredLuminance = getRelativeLuminance(preferred);

    if (getContrastRatio(logoLuminance, preferredLuminance) >= MIN_ICON_CONTRAST_RATIO) {
        return preferredBackgroundColor;
    }

    const whiteContrast = getContrastRatio(logoLuminance, 1);
    const blackContrast = getContrastRatio(logoLuminance, 0);
    return whiteContrast >= blackContrast ? '#FFFFFF' : '#000000';
}

function getThemeLibrary() {
    const library = DynamicSettings.findOne({key: 'themeLibrary'});
    return library?.value || [];
}

function getServerActiveTheme() {
    const setting = DynamicSettings.findOne({key: 'customTheme'});
    return setting?.value || null;
}

function getActiveThemeId() {
    const theme = getServerActiveTheme();
    return theme?.activeThemeId;
}

function isThemeActive(themeId: any) {
    const activeId = getActiveThemeId();
    return Boolean(activeId && themeId === activeId);
}

function themeExportFilename(themeName: unknown, fallbackId: unknown) {
    const baseName = typeof themeName === 'string' && themeName.trim()
        ? themeName.trim()
        : String(fallbackId || 'theme');
    const safeName = Array.from(baseName)
        .map((character) => {
            return character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character)
                ? '-'
                : character;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .replace(/\.+$/g, '')
        .trim();
    return `${safeName || 'theme'}.json`;
}

function setThemeMessage(template: any, level: string, text: string) {
    template?.themeMessage?.set?.({
        level,
        text,
        icon: level === 'success' ? 'fa-check-circle' : level === 'warning' ? 'fa-exclamation-triangle' : level === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'
    });
}

function clearThemeMessage(template: any) {
    template?.themeMessage?.set?.(null);
}

function clearThemeConfirmation(template: any) {
    const pending = template?.themeConfirmation?.get?.();
    if (pending?.resolve) {
        pending.resolve(false);
    }
    template?.themeConfirmation?.set?.(null);
}

function requestThemeConfirmation(template: any, options: any): Promise<boolean> {
    clearThemeConfirmation(template);
    clearThemeMessage(template);

    return new Promise(resolve => {
        template.themeConfirmation.set({
            title: options.title,
            message: options.message,
            confirmLabel: options.confirmLabel || 'Continue',
            confirmClass: options.confirmClass || 'btn-danger',
            resolve
        });
    });
}

async function downloadThemeJson(template: any, themeId: any, filenameFallback = 'theme.json') {
    try {
        const json = await (Meteor as any).callAsync('exportThemeFile', themeId);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filenameFallback;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err: any) {
        setThemeMessage(template, 'error', 'Error exporting theme: ' + (err?.message || err));
    }
}

Template.theme.onCreated(function(this: any) {
    this.subscribe('theme');
    this.subscribe('themeLibrary');
    this.subscriptions = [];
    this.autoruns = [];

    // Memoization cache for contrast calculations
    // Key: "fg-bg", Value: result object
    this.contrastCache = new Map();
    this.themeMessage = new ReactiveVar(null);
    this.themeConfirmation = new ReactiveVar(null);
});

Template.theme.onRendered(function(this: any) {
    this.autoruns.push(this.autorun(() => {
        const theme = getServerActiveTheme();
        if (!theme?.properties) {
            return;
        }
        Tracker.afterFlush(() => syncThemeColorPickers(this.firstNode?.parentNode || document));
    }));
});

Template.theme.onDestroyed(function(this: any) {
    // Clean up autoruns
    this.autoruns.forEach((ar: any) => ar.stop());

    // Clean up subscriptions
    this.subscriptions.forEach((sub: any) => sub.stop());

    // Clear theme save timeouts
    if ((window as any).themeSaveTimeout) {
        clearTimeout((window as any).themeSaveTimeout);
    }
    if ((window as any).themeColorSaveTimeout) {
        clearTimeout((window as any).themeColorSaveTimeout);
    }

    // Clear contrast cache
    this.contrastCache.clear();
});


Template.theme.helpers({
    'currentTheme': function() {
        return getServerActiveTheme();
    },
    'themeEditorValue': function(propId: any) {
        const theme = getServerActiveTheme();
        if (!theme || !theme.properties || !propId) {
            return '';
        }
        return themeEditorDisplayValue(String(propId), theme.properties[propId]);
    },
    'themeColorPickerValue': function(propId: any) {
        const theme = getServerActiveTheme();
        return normalizeColorPickerValue(theme?.properties?.[propId]) || '#000000';
    },
    'availableThemes': function() {
        return getThemeLibrary();
    },
    'hasThemeLibrary': function() {
        return getThemeLibrary().length > 0;
    },
    'isThemeActive': function(themeId: any) {
        return isThemeActive(themeId);
    },
    'themePillModifier': function(themeId: any) {
        return isThemeActive(themeId) ? 'theme-pill-active' : '';
    },
    'themeActivateButtonLabel': function(themeId: any) {
        return isThemeActive(themeId) ? 'Active' : 'Activate';
    },
    'themeActivateButtonClass': function(themeId: any) {
        return isThemeActive(themeId) ? 'btn-secondary' : '';
    },
    'themeOrigin': function(origin: any) {
        return origin === 'system' ? 'System default' : 'Custom';
    },
    'isSystemTheme': function(origin: any) {
        return origin === 'system';
    },
    'themeActivationAttrs': function(themeId: any) {
        return isThemeActive(themeId)
            ? { disabled: true, 'aria-disabled': true }
            : {};
    },
    'customHelpPageEnabled': function() {
        const theme = getServerActiveTheme();
        const help = theme?.help;
        if (!help || help.enabled === false) {
            return false;
        }
        return Boolean(help.markdown?.length || help.url?.length);
    },
    'customHelpPageUploadedAt': function() {
        const theme = getServerActiveTheme();
        return theme?.help?.uploadedAt || null;
    },
    'formatDate': function(date: any) {
        if (!date) return '';
        return new Date(date).toLocaleString();
    },
    'getContrastInfo': function(fgProp: any, bgProp: any) {
        const instance = Template.instance() as any;
        const theme = getServerActiveTheme();
        if (!theme || !theme.properties) return null;

        const fg = theme.properties[fgProp];
        const bg = theme.properties[bgProp];

        if (!fg || !bg) return null;

        // Use memoization cache to avoid recalculating same color pairs
        const cacheKey = `${fg}-${bg}`;
        if (instance.contrastCache.has(cacheKey)) {
            return instance.contrastCache.get(cacheKey);
        }

        const ratio = calculateContrastRatio(fg, bg);
        const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Fail';
        const badgeClass = ratio >= 7 ? 'success' : ratio >= 4.5 ? 'warning' : 'danger';

        const result = {
            ratio: ratio.toFixed(1),
            level: level,
            badgeClass: badgeClass,
            passes: ratio >= 4.5
        };

        // Cache the result
        instance.contrastCache.set(cacheKey, result);

        return result;
    },
    'themeMessage': function() {
        return (Template.instance() as any).themeMessage.get();
    },
    'themeConfirmation': function() {
        return (Template.instance() as any).themeConfirmation.get();
    }
});

// Contrast calculation helper functions
function hexToRgb(hex: any) {
    // Remove # if present
    hex = hex.replace(/^#/, '');

    // Handle short form (e.g., #fff)
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    const bigint = parseInt(hex, 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function relativeLuminance(rgb: any) {
    const rsRGB = rgb.r / 255;
    const gsRGB = rgb.g / 255;
    const bsRGB = rgb.b / 255;

    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function calculateContrastRatio(fgHex: any, bgHex: any) {
    try {
        const fgRgb = hexToRgb(fgHex);
        const bgRgb = hexToRgb(bgHex);

        const fgLum = relativeLuminance(fgRgb);
        const bgLum = relativeLuminance(bgRgb);

        const lighter = Math.max(fgLum, bgLum);
        const darker = Math.min(fgLum, bgLum);

        return (lighter + 0.05) / (darker + 0.05);
    } catch (e) {
        return 0;
    }
}

function validateThemePropInput(inputEl: any, propId: any, rawValue: any) {
    let value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    let valid = true;

    if (isThemeTransitionProperty(propId)) {
        value = normalizeThemePropertyValue(propId, value);
        valid = typeof value === 'string' && isValidThemeCssTime(value);
    }

    if (propId === 'app_font_family' || propId === 'app_heading_font_family') {
        valid = typeof value === 'string' && value.length > 0;
    }

    if (propId === 'app_font_stylesheet_url') {
        valid = typeof value === 'string';
    }

    if (isThemeDensityScaleProperty(propId)) {
        value = normalizeThemePropertyValue(propId, value);
        valid = isValidThemeDensityScale(value);
    } else if (propId === 'app_font_size_base' || isThemeLengthProperty(propId)) {
        value = normalizeThemePropertyValue(propId, value);
        valid = typeof value === 'string' && isValidThemeCssLength(value);
    }

    if (inputEl) {
        if (valid) {
            inputEl.classList.remove('is-invalid');
        } else {
            inputEl.classList.add('is-invalid');
        }
    }

    return { valid, value };
}

function applyThemeCssVariable(property: string, rawValue: unknown) {
    const propConverted = '--' + property.replace(/_/g, '-');
    const normalizedValue = normalizeThemePropertyValue(property, rawValue);
    const normalizedText = typeof normalizedValue === 'string' ? normalizedValue.trim() : normalizedValue;

    if (normalizedText == null || normalizedText === '') {
        document.documentElement.style.removeProperty(propConverted);
        return;
    }

    document.documentElement.style.setProperty(propConverted, String(normalizedText));
}

function applyThemeFontStylesheet(rawValue: unknown) {
    const href = typeof rawValue === 'string' ? rawValue.trim() : '';
    const existingLink = document.getElementById(THEME_FONT_STYLESHEET_LINK_ID) as HTMLLinkElement | null;

    if (!href) {
        existingLink?.remove();
        return;
    }

    const link = existingLink || document.createElement('link');
    link.id = THEME_FONT_STYLESHEET_LINK_ID;
    link.rel = 'stylesheet';

    if (!existingLink) {
        document.head.appendChild(link);
    }

    if (link.getAttribute('href') !== href) {
        link.href = href;
    }
}

function applyThemePropertyPreview(property: string, value: unknown) {
    applyThemeCssVariable(property, value);
    if (property === 'app_font_stylesheet_url') {
        applyThemeFontStylesheet(value);
    }
}

function applyThemeState(themeData: any) {
    if (!themeData?.properties) {
        throw new Error('[Theme] Active theme payload is missing properties');
    }

    Session.set('serverActiveTheme', themeData);
    Session.set('themeReady', true);
    if (Session.get('userThemeOverrideActive') !== true) {
        Session.set('curTheme', themeData);
        Object.entries(themeData.properties).forEach(([property, value]) => {
            applyThemePropertyPreview(property, value);
        });
        document.title = themeData.properties.themeName || 'MoFaCTS';
    }
    syncThemeColorPickers();
}

function updateServerActiveThemeSessionProperty(property: string, value: unknown) {
    const theme = getServerActiveTheme();
    if (theme && theme.properties) {
        const updatedTheme = {
            ...theme,
            properties: {
                ...theme.properties,
                [property]: value
            }
        };
        Session.set('serverActiveTheme', updatedTheme);
        if (Session.get('userThemeOverrideActive') !== true) {
            Session.set('curTheme', updatedTheme);
        }
    }
}

async function saveThemeProperty(property: string, value: unknown) {
    await (Meteor as any).callAsync('setCustomThemeProperty', property, value);
}

function commitThemePropInput(inputEl: HTMLInputElement | HTMLTextAreaElement, template?: any) {
    const dataId = inputEl.getAttribute('data-id');
    if (!dataId) {
        throw new Error('[Theme] Editable theme field is missing data-id');
    }

    const { valid, value } = validateThemePropInput(inputEl, dataId, inputEl.value);
    if (!valid) {
        return;
    }

    updateServerActiveThemeSessionProperty(dataId, value);

    if (Session.get('userThemeOverrideActive') !== true) {
        applyThemePropertyPreview(dataId, value);
    }
    syncThemeColorPickers();

    (async () => {
        try {
            await saveThemeProperty(dataId, value);
        } catch (err: any) {
            clientConsole(1, `[Theme] Error auto-saving ${dataId}:`, err);
            setThemeMessage(template, 'error', `Error saving ${dataId}: ${err}`);
        }
    })();
}

function getThemeIconBackgroundColor() {
    const theme = getServerActiveTheme();
    const themeProps = theme?.properties || {};
    const backgroundCandidates = [
        themeProps.app_background_color,
        themeProps.navigation_surface_color,
        themeProps.learning_card_surface_color
    ];

    for (const candidate of backgroundCandidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }

    return '#F2F2F2';
}

function createPngDataUrlFromImage(
    img: HTMLImageElement,
    size: number,
    options: {
        backgroundColor?: string;
        paddingRatio?: number;
    } = {}
) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Unable to create canvas context for icon generation');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size);

    if (options.backgroundColor) {
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, size, size);
    }

    const paddingRatio = Math.max(0, Math.min(options.paddingRatio ?? 0, 0.45));
    const maxDrawSize = size * (1 - paddingRatio * 2);
    const widthScale = maxDrawSize / img.width;
    const heightScale = maxDrawSize / img.height;
    const scale = Math.min(widthScale, heightScale);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const dx = (size - drawWidth) / 2;
    const dy = (size - drawHeight) / 2;

    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

    return canvas.toDataURL('image/png');
}

Template.theme.events({
    'click .set-active-theme': async function(event: any, template: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        if (!themeId) {
            return;
        }
        try {
            const activeTheme = await (Meteor as any).callAsync('setActiveTheme', themeId);
            applyThemeState(activeTheme);
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error activating theme: ' + (err?.message || err));
        }
    },
    'click .duplicate-theme': async function(event: any, template: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        const themeName = event.currentTarget.getAttribute('data-name') || 'New Theme';
        const proposedName = `${themeName} Copy`;
        const newName = prompt('Name for duplicated theme', proposedName);
        if (!newName) {
            return;
        }
        try {
            await (Meteor as any).callAsync('duplicateTheme', {
                sourceThemeId: themeId,
                name: newName
            });
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error duplicating theme: ' + (err?.message || err));
        }
    },
    'click .rename-theme': async function(event: any, template: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        const currentName = event.currentTarget.getAttribute('data-name') || 'this theme';
        if (!themeId) {
            return;
        }
        const newName = prompt('Enter new theme name', currentName);
        if (!newName || newName === currentName) {
            return;
        }
        try {
            await (Meteor as any).callAsync('renameTheme', {
                themeId: themeId,
                newName: newName
            });
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error renaming theme: ' + (err?.message || err));
        }
    },
    'click .delete-theme': async function(event: any, template: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        const themeName = event.currentTarget.getAttribute('data-name') || 'this theme';
        if (!themeId) {
            return;
        }
        const confirmed = await requestThemeConfirmation(template, {
            title: `Delete ${themeName}?`,
            message: 'This cannot be undone.',
            confirmLabel: 'Delete theme'
        });
        if (!confirmed) {
            return;
        }
        try {
            await (Meteor as any).callAsync('deleteTheme', themeId);
            setThemeMessage(template, 'success', `${themeName} deleted.`);
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error deleting theme: ' + (err?.message || err));
        }
    },
    'click .export-theme': async function(event: any, template: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        const themeName = event.currentTarget.getAttribute('data-name');
        if (!themeId) {
            return;
        }
        await downloadThemeJson(template, themeId, themeExportFilename(themeName, themeId));
    },
    'click #exportActiveTheme': async function(event: any, template: any) {
        const activeId = getActiveThemeId();
        if (!activeId) {
            setThemeMessage(template, 'warning', 'No active theme selected.');
            return;
        }
        const theme = getServerActiveTheme();
        const filename = themeExportFilename(theme?.metadata?.name || theme?.properties?.themeName, activeId);
        await downloadThemeJson(template, activeId, filename);
    },
    'click #themeImportButton': async function(event: any, template: any) {
        event.preventDefault();
        const fileInput = template.find('#themeImportInput');
        const file = fileInput?.files?.[0];
        if (!file) {
            setThemeMessage(template, 'warning', 'Select a theme JSON file to import.');
            return;
        }
        if (file.size > THEME_IMPORT_MAX_FILE_BYTES) {
            setThemeMessage(template, 'warning', 'Theme files must be smaller than 10MB.');
            return;
        }
        try {
            const text = await file.text();
            await (Meteor as any).callAsync('importThemeFile', text, true);
            fileInput.value = '';
            setThemeMessage(template, 'success', 'Theme imported.');
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error importing theme: ' + (err?.message || err));
        }
    },
    'click #themeResetButton': async function(event: any, template: any) {
        try {
            const activeTheme = await (Meteor as any).callAsync('initializeCustomTheme', 'MoFaCTS');
            applyThemeState(activeTheme);
            setThemeMessage(template, 'success', 'Theme reset to default.');
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error resetting theme: ' + (err?.message || err));
        }
    },
    'input .currentThemeProp': function(event: any) {
        const dataId = event.currentTarget.getAttribute('data-id');
        if (!dataId) {
            throw new Error('[Theme] Editable theme field is missing data-id');
        }
        const { valid, value } = validateThemePropInput(event.currentTarget, dataId, event.currentTarget.value);
        if (valid && isThemeDensityScaleProperty(dataId) && Session.get('userThemeOverrideActive') !== true) {
            applyThemePropertyPreview(dataId, value);
        }
    },
    'keydown .currentThemeProp': function(event: KeyboardEvent, template: any) {
        if (event.key !== 'Enter' || event.shiftKey || event.currentTarget instanceof HTMLTextAreaElement) {
            return;
        }

        event.preventDefault();
        commitThemePropInput(event.currentTarget as HTMLInputElement, template);
    },
    // Native mobile color pickers can open before focus has synchronized the value.
    'pointerdown .currentThemePropColor, focus .currentThemePropColor': function(event: any) {
        const theme = getServerActiveTheme();
        if (theme && theme.properties) {
            syncThemeColorPicker(event.currentTarget, theme.properties);
        }
    },
    'input .currentThemePropColor': function(event: any, instance: any) {
        const data_id = event.currentTarget.getAttribute('data-id');
        const value = normalizeColorPickerValue(event.currentTarget.value);
        if (!value) {
            clientConsole(1, `[Theme] Native color picker produced an invalid value for ${data_id}`);
            return;
        }
        //change the corresponding currentThemeProp value. we need to find a input with the same data-id and change its value
        $(`.currentThemeProp[data-id=${data_id}]`).val(value);

        // Clear contrast cache since colors changed
        if (instance.contrastCache) {
            instance.contrastCache.clear();
        }

        // Update session to trigger reactive updates - create new object for reactivity
        const theme = getServerActiveTheme();
        if (theme && theme.properties) {
            const updatedTheme = {
                ...theme,
                properties: {
                    ...theme.properties,
                    [data_id]: value
                }
            };
            Session.set('serverActiveTheme', updatedTheme);
            if (Session.get('userThemeOverrideActive') !== true) {
                Session.set('curTheme', updatedTheme);
            }
        }

        if (Session.get('userThemeOverrideActive') !== true) {
            applyThemePropertyPreview(data_id, value);
        }

        // Auto-save with debounce (prevents network thrashing during color picker drag)
        clearTimeout((window as any).themeColorSaveTimeout);
        (window as any).themeColorSaveTimeout = setTimeout(async () => {
            try {
                await (Meteor as any).callAsync('setCustomThemeProperty', data_id, value);
                
            } catch (err: any) {
                clientConsole(1, `[Theme] Error auto-saving ${data_id}:`, err);
                setThemeMessage(instance, 'error', `Error saving ${data_id}: ${err}`);
            }
        }, 300);
    },
    'change .currentThemeProp': function(event: any, template: any) {
        commitThemePropInput(event.currentTarget, template);
    },
    'change #homeUnderlayUpload': function(event: any, template: any) {
        const fileInput = event.target;
        const file = fileInput.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            setThemeMessage(template, 'warning', 'Please select an image file.');
            fileInput.value = '';
            return;
        }

        if (file.size > HOME_UNDERLAY_MAX_FILE_BYTES) {
            setThemeMessage(template, 'warning', 'Underlay image file size must be less than 5MB.');
            fileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e: any) {
            const base64Data = e.target.result;
            try {
                updateServerActiveThemeSessionProperty('practice_menu_underlay_image_url', base64Data);
                await saveThemeProperty('practice_menu_underlay_image_url', base64Data);
                fileInput.value = '';
                setThemeMessage(template, 'success', 'Home underlay image uploaded.');
            } catch (err: any) {
                setThemeMessage(template, 'error', 'Error uploading home underlay image: ' + (err?.message || err));
            }
        };
        reader.onerror = function() {
            setThemeMessage(template, 'error', 'Error reading home underlay image.');
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
    },
    'click #clearHomeUnderlay': async function(event: any, template: any) {
        try {
            updateServerActiveThemeSessionProperty('practice_menu_underlay_image_url', '');
            await saveThemeProperty('practice_menu_underlay_image_url', '');
            $('#homeUnderlayUpload').val('');
            $('.currentThemeProp[data-id=practice_menu_underlay_image_url]').val('');
            setThemeMessage(template, 'success', 'Home underlay image cleared.');
        } catch (err: any) {
            setThemeMessage(template, 'error', 'Error clearing home underlay image: ' + (err?.message || err));
        }
    },
    'change #logoUpload': function(event: any, template: any) {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setThemeMessage(template, 'warning', 'Please select an image file.');
                return;
            }
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                setThemeMessage(template, 'warning', 'File size must be less than 2MB.');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function(e: any) {
                const base64Data = e.target.result;

                // Create image to generate favicons
                const img = new Image();
                img.onload = async function() {
                    try {
                        const backgroundColor = getContrastingIconBackgroundColor(
                            img,
                            getThemeIconBackgroundColor()
                        );

                        // Upload the logo
                        await (Meteor as any).callAsync('setCustomThemeProperty', 'brand_logo_url', base64Data);

                        const generatedIcons: Record<string, string> = {
                            brand_favicon_32_url: createPngDataUrlFromImage(img, 32),
                            brand_favicon_16_url: createPngDataUrlFromImage(img, 16),
                            brand_apple_touch_icon_url: createPngDataUrlFromImage(img, 180, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.10
                            }),
                            brand_android_icon_192_url: createPngDataUrlFromImage(img, 192, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.10
                            }),
                            brand_android_icon_512_url: createPngDataUrlFromImage(img, 512, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.10
                            }),
                            brand_android_maskable_icon_192_url: createPngDataUrlFromImage(img, 192, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.18
                            }),
                            brand_android_maskable_icon_512_url: createPngDataUrlFromImage(img, 512, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.18
                            })
                        };

                        for (const [property, generatedData] of Object.entries(generatedIcons)) {
                            await (Meteor as any).callAsync('setCustomThemeProperty', property, generatedData);
                        }

                        
                        // PHASE 1.5: No need to call getCurrentTheme() - reactive subscription handles it
                        setThemeMessage(template, 'success', 'Logo uploaded.');
                    } catch (err: any) {
                        setThemeMessage(template, 'error', "Error uploading logo: " + err);
                    }
                };
                img.src = base64Data;
            };
            reader.readAsDataURL(file);
        }
    },
    'click #clearLogo': async function(event: any, template: any) {
        const confirmed = await requestThemeConfirmation(template, {
            title: 'Clear logo?',
            message: 'The active theme logo will be removed.',
            confirmLabel: 'Clear logo'
        });
        if (confirmed) {
            try {
                await (Meteor as any).callAsync('setCustomThemeProperty', 'brand_logo_url', '');
                
                $('#logoUpload').val('');
                // PHASE 1.5: No need to call getCurrentTheme() - reactive subscription handles it
                setThemeMessage(template, 'success', 'Logo cleared.');
            } catch (err: any) {
                setThemeMessage(template, 'error', "Error clearing logo: " + err);
            }
        }
    },

    // Custom Help Page Upload
    'click #uploadHelpFileButton': function() {
        const fileInput = document.getElementById('helpFileUpload') as any;
        const file = fileInput.files[0];
        const statusSpan = document.getElementById('helpFileUploadStatus') as any;

        if (!file) {
            statusSpan.textContent = 'Please select a file first';
            statusSpan.className = 'text-danger';
            return;
        }

        // Validate file extension
        if (!file.name.endsWith('.md')) {
            statusSpan.textContent = 'Please select a markdown (.md) file';
            statusSpan.className = 'text-danger';
            return;
        }

        // Validate file size (1MB max)
        if (file.size > 1048576) {
            statusSpan.textContent = 'File size must be less than 1MB';
            statusSpan.className = 'text-danger';
            return;
        }

        statusSpan.textContent = 'Uploading...';
        statusSpan.className = 'text-info';

        // Read file as text
        const reader = new FileReader();
        reader.onload = async function(e: any) {
            const markdownContent = e.target.result;

                try {
                    await (Meteor as any).callAsync('setCustomHelpPage', markdownContent);
                    statusSpan.textContent = 'Custom help page uploaded successfully!';
                    statusSpan.className = 'text-success';
                    fileInput.value = '';
                } catch (err: any) {
                    statusSpan.textContent = 'Error: ' + err.message;
                    statusSpan.className = 'text-danger';
                }
        };

        reader.onerror = function() {
            statusSpan.textContent = 'Error reading file';
            statusSpan.className = 'text-danger';
        };

        reader.readAsText(file);
    },

    'click #removeHelpFileButton': async function(event: any, template: any) {
        const confirmed = await requestThemeConfirmation(template, {
            title: 'Remove custom help page?',
            message: 'The app will revert to the wiki help page.',
            confirmLabel: 'Remove help page'
        });
        if (confirmed) {
            const statusSpan = document.getElementById('helpFileUploadStatus') as any;
            statusSpan.textContent = 'Removing...';
            statusSpan.className = 'text-info';

            try {
                await (Meteor as any).callAsync('removeCustomHelpPage');
                statusSpan.textContent = 'Custom help page removed. Now using wiki.';
                statusSpan.className = 'text-success';
            } catch (err: any) {
                statusSpan.textContent = 'Error: ' + err.message;
                statusSpan.className = 'text-danger';
            }
        }
    },

    'click #cancel-theme-confirmation': function(event: any, template: any) {
        event.preventDefault();
        clearThemeConfirmation(template);
    },

    'click #confirm-theme-confirmation': function(event: any, template: any) {
        event.preventDefault();
        const pending = template.themeConfirmation.get();
        if (pending?.resolve) {
            pending.resolve(true);
        }
        template.themeConfirmation.set(null);
    }
});




