import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import {
    isThemeLengthProperty,
    isThemeTransitionProperty,
    isValidThemeCssLength,
    isValidThemeCssTime,
    normalizeThemePropertyValue,
    themeEditorDisplayValue,
} from '../../common/themePropertyNormalization';
import { clientConsole } from '../lib/clientLogger';
import './theme.html';

declare const DynamicSettings: any;
declare const $: any;

const THEME_FONT_STYLESHEET_LINK_ID = 'mofacts-theme-font-stylesheet';

function getThemeLibrary() {
    const library = DynamicSettings.findOne({key: 'themeLibrary'});
    return library?.value || [];
}

function getActiveThemeId() {
    const theme = Session.get('curTheme');
    return theme?.activeThemeId;
}

function isThemeActive(themeId: any) {
    const activeId = getActiveThemeId();
    return Boolean(activeId && themeId === activeId);
}

async function downloadThemeJson(themeId: any, filenameFallback = 'theme.json') {
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
        alert('Error exporting theme: ' + (err?.message || err));
    }
}

Template.theme.onCreated(function(this: any) {
    this.subscribe('themeLibrary');
    this.subscriptions = [];
    this.autoruns = [];

    // Memoization cache for contrast calculations
    // Key: "fg-bg", Value: result object
    this.contrastCache = new Map();
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
        return Session.get('curTheme');
    },
    'themeEditorValue': function(propId: any) {
        const theme = Session.get('curTheme');
        if (!theme || !theme.properties || !propId) {
            return '';
        }
        return themeEditorDisplayValue(String(propId), theme.properties[propId]);
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
        const theme = Session.get('curTheme');
        const help = theme?.help;
        if (!help || help.enabled === false) {
            return false;
        }
        return Boolean(help.markdown?.length || help.url?.length);
    },
    'customHelpPageUploadedAt': function() {
        const theme = Session.get('curTheme');
        return theme?.help?.uploadedAt || null;
    },
    'formatDate': function(date: any) {
        if (!date) return '';
        return new Date(date).toLocaleString();
    },
    'getContrastInfo': function(fgProp: any, bgProp: any) {
        const instance = Template.instance() as any;
        const theme = Session.get('curTheme');
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
    'navbarAlignmentAttrs': function(value: any) {
        const theme = Session.get('curTheme');
        const currentAlignment = theme?.properties?.navbar_alignment;
        return currentAlignment === value ? { selected: true } : {};
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

    if (propId === 'font_family' || propId === 'heading_font_family') {
        valid = typeof value === 'string' && value.length > 0;
    }

    if (propId === 'font_stylesheet_url') {
        valid = typeof value === 'string';
    }

    if (propId === 'font_size_base' || isThemeLengthProperty(propId)) {
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
    const normalizedText = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

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
    if (property === 'font_stylesheet_url') {
        applyThemeFontStylesheet(value);
    }
}

function getThemeIconBackgroundColor() {
    const theme = Session.get('curTheme');
    const themeProps = theme?.properties || {};
    const backgroundCandidates = [
        themeProps.background_color,
        themeProps.neutral_color,
        themeProps.card_background_color
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
    'click .set-active-theme': async function(event: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        if (!themeId) {
            return;
        }
        try {
            await (Meteor as any).callAsync('setActiveTheme', themeId);
        } catch (err: any) {
            alert('Error activating theme: ' + (err?.message || err));
        }
    },
    'click .duplicate-theme': async function(event: any) {
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
            alert('Error duplicating theme: ' + (err?.message || err));
        }
    },
    'click .rename-theme': async function(event: any) {
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
            alert('Error renaming theme: ' + (err?.message || err));
        }
    },
    'click .delete-theme': async function(event: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        const themeName = event.currentTarget.getAttribute('data-name') || 'this theme';
        if (!themeId) {
            return;
        }
        if (!confirm(`Delete ${themeName}? This cannot be undone.`)) {
            return;
        }
        try {
            await (Meteor as any).callAsync('deleteTheme', themeId);
        } catch (err: any) {
            alert('Error deleting theme: ' + (err?.message || err));
        }
    },
    'click .export-theme': async function(event: any) {
        event.preventDefault();
        const themeId = event.currentTarget.getAttribute('data-id');
        const filename = event.currentTarget.getAttribute('data-filename') || `${themeId}.json`;
        if (!themeId) {
            return;
        }
        await downloadThemeJson(themeId, filename);
    },
    'click #exportActiveTheme': async function() {
        const activeId = getActiveThemeId();
        if (!activeId) {
            alert('No active theme selected.');
            return;
        }
        const theme = Session.get('curTheme');
        const filename = (theme?.properties?.themeName || activeId) + '.json';
        await downloadThemeJson(activeId, filename);
    },
    'click #themeImportButton': async function(event: any, template: any) {
        event.preventDefault();
        const fileInput = template.find('#themeImportInput');
        const file = fileInput?.files?.[0];
        if (!file) {
            alert('Select a theme JSON file to import.');
            return;
        }
        if (file.size > 1024 * 1024) {
            alert('Theme files must be smaller than 1MB.');
            return;
        }
        try {
            const text = await file.text();
            await (Meteor as any).callAsync('importThemeFile', text, true);
            fileInput.value = '';
        } catch (err: any) {
            alert('Error importing theme: ' + (err?.message || err));
        }
    },
    'click #themeResetButton': async function() {
        try {
            await (Meteor as any).callAsync('initializeCustomTheme', 'MoFaCTS');
            // PHASE 1.5: No need to call getCurrentTheme() - reactive subscription handles it
            // The Tracker.autorun in getCurrentTheme will detect the theme change automatically
        } catch (err: any) {
            // Theme initialization fallback keeps existing default theme.
        }
    },
    'input .currentThemeProp': function(event: any) {
        const data_id = event.currentTarget.getAttribute('data-id');
        const { valid, value } = validateThemePropInput(event.currentTarget, data_id, event.currentTarget.value);
        if (!valid) {
            return;
        }

        // Update session to trigger reactive updates - create new object for reactivity
        const theme = Session.get('curTheme');
        if (theme && theme.properties) {
            const updatedTheme = {
                ...theme,
                properties: {
                    ...theme.properties,
                    [data_id]: value
                }
            };
            Session.set('curTheme', updatedTheme);
        }

        // Apply CSS immediately for instant preview
        applyThemePropertyPreview(data_id, value);

        // Auto-save with debounce (wait 1 second after user stops typing)
        clearTimeout((window as any).themeSaveTimeout);
        (window as any).themeSaveTimeout = setTimeout(async () => {
            try {
                await (Meteor as any).callAsync('setCustomThemeProperty', data_id, value);
                
            } catch (err: any) {
                clientConsole(1, `[Theme] Error auto-saving ${data_id}:`, err);
                alert(`Error saving ${data_id}: ${err}`);
            }
        }, 1000);
    },
    // Initialize color picker value when opened (more efficient than reactive autorun)
    'focus .currentThemePropColor': function(event: any) {
        const theme = Session.get('curTheme');
        if (theme && theme.properties) {
            const propId = event.currentTarget.getAttribute('data-id');
            const value = theme.properties[propId];
            if (value && value.startsWith('#')) {
                event.currentTarget.value = value;
            }
        }
    },
    'input .currentThemePropColor': function(event: any, instance: any) {
        const data_id = event.currentTarget.getAttribute('data-id');
        const value = event.currentTarget.value;
        //change the corresponding currentThemeProp value. we need to find a input with the same data-id and change its value
        $(`.currentThemeProp[data-id=${data_id}]`).val(value);

        // Clear contrast cache since colors changed
        if (instance.contrastCache) {
            instance.contrastCache.clear();
        }

        // Update session to trigger reactive updates - create new object for reactivity
        const theme = Session.get('curTheme');
        if (theme && theme.properties) {
            const updatedTheme = {
                ...theme,
                properties: {
                    ...theme.properties,
                    [data_id]: value
                }
            };
            Session.set('curTheme', updatedTheme);
        }

        // Apply CSS variable immediately for instant visual feedback
        applyThemePropertyPreview(data_id, value);

        // Auto-save with debounce (prevents network thrashing during color picker drag)
        clearTimeout((window as any).themeColorSaveTimeout);
        (window as any).themeColorSaveTimeout = setTimeout(async () => {
            try {
                await (Meteor as any).callAsync('setCustomThemeProperty', data_id, value);
                
            } catch (err: any) {
                clientConsole(1, `[Theme] Error auto-saving ${data_id}:`, err);
                alert(`Error saving ${data_id}: ${err}`);
            }
        }, 300);
    },
    'change .currentThemeProp': function(event: any) {
        // Handle change events for select dropdowns and other elements that don't fire input events
        const data_id = event.currentTarget.getAttribute('data-id');
        const { valid, value } = validateThemePropInput(event.currentTarget, data_id, event.currentTarget.value);
        if (!valid) {
            return;
        }

        // Update session to trigger reactive updates - create new object for reactivity
        const theme = Session.get('curTheme');
        if (theme && theme.properties) {
            const updatedTheme = {
                ...theme,
                properties: {
                    ...theme.properties,
                    [data_id]: value
                }
            };
            Session.set('curTheme', updatedTheme);
        }

        // Apply CSS immediately for instant visual feedback
        applyThemePropertyPreview(data_id, value);

        // Auto-save immediately for dropdowns
        (async () => {
            try {
                await (Meteor as any).callAsync('setCustomThemeProperty', data_id, value);
                
            } catch (err: any) {
                clientConsole(1, `[Theme] Error auto-saving ${data_id}:`, err);
                alert(`Error saving ${data_id}: ${err}`);
            }
        })();
    },
    'change #logoUpload': function(event: any) {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('Please select an image file');
                return;
            }
            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                alert('File size must be less than 2MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function(e: any) {
                const base64Data = e.target.result;

                // Create image to generate favicons
                const img = new Image();
                img.onload = async function() {
                    try {
                        const backgroundColor = getThemeIconBackgroundColor();

                        // Upload the logo
                        await (Meteor as any).callAsync('setCustomThemeProperty', 'logo_url', base64Data);

                        const generatedIcons: Record<string, string> = {
                            favicon_32_url: createPngDataUrlFromImage(img, 32),
                            favicon_16_url: createPngDataUrlFromImage(img, 16),
                            apple_touch_icon_url: createPngDataUrlFromImage(img, 180, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.10
                            }),
                            android_icon_192_url: createPngDataUrlFromImage(img, 192, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.10
                            }),
                            android_icon_512_url: createPngDataUrlFromImage(img, 512, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.10
                            }),
                            android_maskable_icon_192_url: createPngDataUrlFromImage(img, 192, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.18
                            }),
                            android_maskable_icon_512_url: createPngDataUrlFromImage(img, 512, {
                                backgroundColor: backgroundColor,
                                paddingRatio: 0.18
                            })
                        };

                        for (const [property, generatedData] of Object.entries(generatedIcons)) {
                            await (Meteor as any).callAsync('setCustomThemeProperty', property, generatedData);
                        }

                        
                        // PHASE 1.5: No need to call getCurrentTheme() - reactive subscription handles it
                    } catch (err: any) {
                        alert("Error uploading logo: " + err);
                    }
                };
                img.src = base64Data;
            };
            reader.readAsDataURL(file);
        }
    },
    'click #clearLogo': async function() {
        if (confirm('Are you sure you want to clear the logo?')) {
            try {
                await (Meteor as any).callAsync('setCustomThemeProperty', 'logo_url', '');
                
                $('#logoUpload').val('');
                // PHASE 1.5: No need to call getCurrentTheme() - reactive subscription handles it
            } catch (err: any) {
                alert("Error clearing logo: " + err);
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

    'click #removeHelpFileButton': async function() {
        if (confirm('Are you sure you want to remove the custom help page and revert to the wiki?')) {
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
    }
});




