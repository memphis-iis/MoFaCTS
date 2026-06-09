# Theme Generation Wizard Plan

This plan updates the theme generation wizard planning notes for compatibility with the current MoFaCTS codebase.

## Compatibility Summary

The theme generation wizard is compatible with the current theme system, with these required adjustments:

- Implement the admin UI in the existing Blaze theme editor at `mofacts/client/views/theme.html` and `mofacts/client/views/theme.ts`, or mount a Svelte island deliberately from that route. Do not implement `ThemeGenerationWizard.tsx`; React is not part of the current app stack.
- Keep generation logic on the client unless a future requirement needs database access, authentication enforcement beyond existing admin methods, secrets, or external APIs. Server methods should remain limited to persistence and authorization.
- Store generated themes through the existing theme registry path. The wizard should create a new custom theme and activate it immediately.
- Do not add silent compatibility fallback paths. If input colors, theme source IDs, required generated roles, or CSS-value parsing fail, show a clear validation error and block generation.
- Generate complete current theme properties, not only the 19 color roles from the original plan. The registry currently merges missing values with its default theme, but the wizard should still output every property it controls so the generated result is explainable and durable.
- Preserve the reason the 19-role analysis was done: those roles define the fundamental contrast schema for usable MoFaCTS themes. The generator must satisfy that schema before the generated theme can be created and activated.

## Current Theme Architecture

Current code paths:

- Admin editor: `mofacts/client/views/theme.html`
- Admin editor logic: `mofacts/client/views/theme.ts`
- Persistence and admin methods: `mofacts/server/methods/themeMethods.ts`
- Registry, import/export, theme library, legacy rename boundary: `mofacts/server/lib/themeRegistry.ts`
- Property normalization: `mofacts/common/themePropertyNormalization.ts`
- Runtime CSS variables: `mofacts/public/styles/classic.css`
- Bundled theme JSON: `mofacts/public/themes/*.json`
- Vocabulary audit: `docs/theme-vocabulary-audit.md`

Themes are stored as JSON with `properties` in snake_case. Runtime application emits each property as a kebab-case CSS variable. Existing import/load code migrates legacy names to current names, but new wizard output must use current names only.

The current stored theme vocabulary includes colors, density/layout, typography, transitions, branding, and help metadata. The wizard should treat palette selection and expansion as the source-color layer, apply the 19-pair contrast schema to assign semantic roles from that palette, then compose density and the remaining theme fields into a complete theme payload.

## Entry Point

Add an inline wizard panel or inline expandable section near the existing Theme Library controls.

Preferred entry button:

```text
Generate Theme
```

Use inline UI patterns in the admin page instead of modal popups. The wizard must not replace the manual editor. It should generate one theme, create it as a custom theme, and make it the active theme.

## Step 1: Choose Source Palette

User options:

```text
Choose colors with color selectors
Paste colors
Upload palette JSON
Extract from current active theme
Start from MoFaCTS Default
Start from selected theme
```

The primary interaction should be a small editable palette, not a free-form text box. Start with four color slots because most generated themes need at least:

```text
one primary/accent color
one light or surface color
one dark or text color
one feedback/secondary color
```

Each slot should have:

```text
native color selector
hex text field
optional label
remove button
```

Users can add or remove slots:

```text
minimum: 2 colors
recommended: 4 colors
soft maximum before warning: 8 colors
```

If the user provides only two or three colors, the wizard should still try to generate a theme when palette expansion permits companions. If expansion is set to exact colors only and the palette is too small to satisfy the contrast schema, generation should fail with a clear explanation.

Accepted pasted colors:

```text
#7ed957
#000000
#ffffff
rgb(126, 217, 87)
```

The paste box is an advanced shortcut that fills the color selector slots. First implementation should accept hex and `rgb()` values. `color-mix()`, CSS variables, gradients, shadows, and image URLs should be reported as skipped CSS values in diagnostics, not silently converted.

Palette stats:

```text
number of colors
darkest color
lightest color
median luminance
number of chromatic colors
number of low-chroma/neutral colors
skipped/unresolved CSS values
```

Example warning:

```text
This palette has no dark neutral color, so readable text requires generating a shade.
```

## Step 2: Choose Theme Polarity

Main choice:

```text
Light
Dark
```

Do not include `Auto` as a generated theme polarity. The wizard may recommend Light or Dark after analyzing the selected palette, but generation should target one explicit polarity. This keeps the contrast schema deterministic: surfaces and text roles are assigned for either a light theme or a dark theme.

Internal representation:

```ts
type ThemePolarityOptions = {
  polarity: "light" | "dark";
};
```

For current MoFaCTS roles, the polarity decision informs how the 19-pair contrast schema assigns background, text, navigation, card, stimulus, secondary, and action colors. Do not introduce any additional surface relationship model in the first version.

```text
app_background_color
navigation_surface_color
learning_card_surface_color
learning_card_stimulus_surface_color
app_secondary_surface_color
media_video_overlay_surface_color
app_loading_overlay_color
practice_menu_accuracy_bar_track_color
```

## Step 3: Contrast Priority

Use a continuous slider:

```text
Softer appearance <- -> Maximum readability
```

Internal value:

```ts
type ContrastPriority = number; // 0 to 1
```
```

Contrast failures for required role pairs should block generation unless the user changes inputs. They should not be repaired by hidden substitution after generation.

Important sequencing: the contrast schema is applied after the palette is chosen and expanded. It is not a pre-palette constraint and not only a final report. It determines which palette colors can be assigned to text, surface, action, feedback, navigation, card, stimulus, and accuracy roles.

Contrast priority tunes how strictly the 19-pair schema is applied. It should adjust targets, penalties, and palette-drift tolerance; it should not disable any required schema pair.

```text
Soft: require AA where the schema requires readability, tolerate lower distinctness penalties.
Balanced: require AA and prefer clearer distinctness.
Accessible: prefer AAA for normal text where palette expansion can satisfy it.
High contrast: maximize schema contrast even when palette fidelity drops.
```

## Step 4: Palette Expansion

Options:

```text
Use only exact colors
Allow tints and shades
Allow muted surface variants
Allow generated companions
```

Generated companions may include:

```text
dark text companion
light text companion
surface tint
button hover shade
disabled text color
error feedback companion
success feedback companion
```

Internal representation:

```ts
type PaletteExpansionOptions = {
  allowTints: boolean;
  allowShades: boolean;
  allowMutedVariants: boolean;
  allowGeneratedCompanions: boolean;
  maxGeneratedPerColor: number;
};
```

If the selected expansion level cannot satisfy required contrast and distinctness constraints, generation should fail clearly with the blocking role pairs named.

## Step 5: Choose Density

Density is a new wizard-level generation control. It is not currently a single stored MoFaCTS theme property.

The current theme vocabulary has separate layout fields:

```text
app_font_size_base
app_density_scale
app_button_height
app_text_input_height
```

Important distinction:

```text
app_density_scale:
  existing theme field
  exposed in the manual editor as "Spacing Density Scale"
  controls shared spacing/padding tokens only

Wizard Density:
  wizard-level control
  writes app_density_scale plus font and control-height fields
```

The wizard should keep density separate from palette/polarity:

```text
Visual identity:
- palette
- polarity
- accent style
- feedback colors

Density:
- numeric percentage
```

Use a single numeric value instead of named presets.

Default value: `100%`.

The wizard density percentage should write `app_density_scale` as one of its outputs:

```text
25% -> app_density_scale: 0.25
50% -> app_density_scale: 0.5
100% -> app_density_scale: 1
200% -> app_density_scale: 2
```

The current editor allows `app_density_scale` from greater than 0 to 2 at the server normalization layer. The wizard uses a wider visible range:

```text
minimum: 25%
default: 100%
maximum: 200%
```

Apply this wizard density value fully to spacing and half-strength to font/control sizing. The size scale is:

```text
size scale = (density scale + 1) / 2
```

With the current wizard defaults:

```text
app_font_size_base: 16px * size scale
app_button_height: 32px * size scale
app_text_input_height: 32px * size scale
app_density_scale: scale
```

For example:

```text
25% -> 10px base font, 20px buttons, 20px text inputs, density scale 0.25
50% -> 12px base font, 24px buttons, 24px text inputs, density scale 0.5
100% -> 16px base font, 32px buttons, 32px text inputs, density scale 1
200% -> 24px base font, 48px buttons, 48px text inputs, density scale 2
```

Wizard density may affect contrast scoring continuously. Smaller percentages should raise readability targets because smaller text and controls tolerate less contrast loss. Larger percentages should not lower hard minimums.

## Step 6: Semantic Role Assignment

After the source palette is chosen and expanded, the original 19-role analysis becomes the core accessibility schema for generated themes. It identifies the role pairs that determine whether the generated UI is actually usable, so the wizard must use those pairs to build semantic assignments, not merely check a finished assignment afterward.

The current codebase has one additional closely related role, the accuracy bar track. Include it so the practice menu progress UI is generated and checked as a pair.

```text
app_background_color
app_text_color
app_page_header_text_color
app_primary_action_surface_color
app_primary_action_text_color
app_accent_color
app_secondary_surface_color
app_secondary_text_color
learning_card_audio_icon_disabled_color
learning_card_audio_control_color
feedback_correct_color
feedback_error_color
navigation_text_color
navigation_surface_color
learning_card_surface_color
learning_card_stimulus_surface_color
learning_card_primary_action_surface_color
learning_card_primary_action_text_color
practice_menu_accuracy_bar_fill_color
practice_menu_accuracy_bar_track_color
```

The practice menu accuracy bar has two semantic colors:

```text
practice_menu_accuracy_bar_fill_color: achieved / active portion
practice_menu_accuracy_bar_track_color: unachieved / remaining portion
```

The current runtime uses the track as the `.accuracy-bar` background and the fill as the `.accuracy-fill` foreground. The track is not part of the original common19 archive, so the wizard schema must add it explicitly.

For generated themes, derive the track from the app text/background direction unless the user later edits it manually:

```text
Light theme: track should be darker than app_background_color.
Dark theme: track should be brighter than app_background_color.
```

The active fill should be more visually prominent than the track. The track still needs to be visible against the app background, but it does not need the same contrast target as text.

## Canonical Widget Relationship Contrast Schema

The wizard should keep a canonical relationship schema in code and documentation. These relationships are tied to MoFaCTS widgets and semantic roles, not to individual themes, so they should change only when the relevant widget structure changes.

The `theme_palette_reports_default_ordered_common19.zip` sample set provides the initial WCAG contrast baselines for the shared 19-role colors. The 20th color, `practice_menu_accuracy_bar_track_color`, is not in that common19 archive and must be added by the wizard schema.

Use the sampled themes to infer one averaged light baseline and one averaged dark baseline:

```text
Light baseline: average of MoFaCTS Default and Whimsical Refined.
Dark baseline: average of Dark Industrial and Dark Industrial Small.
```

The current dark samples have identical relevant colors, so the dark average currently equals the Dark Industrial values. If future dark samples differ, recompute the dark average instead of changing the schema relationships.

Light averaged baseline:

| Relationship | Average contrast | Generator target |
| --- | ---: | --- |
| `app_background_color` vs `app_text_color` | 16.27 | >= 4.5, prefer >= 7 |
| `app_background_color` vs `app_page_header_text_color` | 16.27 | >= 4.5, prefer >= 7 |
| `app_primary_action_surface_color` vs `app_primary_action_text_color` | 10.73 | >= 4.5, prefer >= 7 |
| `app_secondary_surface_color` vs `app_secondary_text_color` | 13.23 | >= 4.5, prefer >= 7 |
| `navigation_surface_color` vs `navigation_text_color` | 17.81 | >= 4.5, prefer >= 7 |
| `learning_card_surface_color` vs `app_text_color` | 17.88 | >= 4.5, prefer >= 7 |
| `learning_card_stimulus_surface_color` vs `app_text_color` | 17.21 | >= 4.5, prefer >= 7 |
| `learning_card_primary_action_surface_color` vs `learning_card_primary_action_text_color` | 9.55 | >= 4.5, prefer >= 7 |
| `practice_menu_accuracy_bar_fill_color` vs `app_background_color` | 3.35 | >= 3.0, prefer >= 4.5 |
| `practice_menu_accuracy_bar_track_color` vs `app_background_color` | 1.28 | >= 1.3, prefer >= 1.5 |
| `practice_menu_accuracy_bar_fill_color` vs `practice_menu_accuracy_bar_track_color` | 2.64 | >= 2.0, prefer >= 3.0 |

Dark averaged baseline:

| Relationship | Average contrast | Generator target |
| --- | ---: | --- |
| `app_background_color` vs `app_text_color` | 12.95 | >= 4.5, prefer >= 7 |
| `app_background_color` vs `app_page_header_text_color` | 12.95 | >= 4.5, prefer >= 7 |
| `app_primary_action_surface_color` vs `app_primary_action_text_color` | 5.51 | >= 4.5, prefer >= 7 |
| `app_secondary_surface_color` vs `app_secondary_text_color` | 9.29 | >= 4.5, prefer >= 7 |
| `navigation_surface_color` vs `navigation_text_color` | 12.79 | >= 4.5, prefer >= 7 |
| `learning_card_surface_color` vs `app_text_color` | 11.17 | >= 4.5, prefer >= 7 |
| `learning_card_stimulus_surface_color` vs `app_text_color` | 12.08 | >= 4.5, prefer >= 7 |
| `learning_card_primary_action_surface_color` vs `learning_card_primary_action_text_color` | 4.82 | >= 4.5, prefer >= 7 |
| `practice_menu_accuracy_bar_fill_color` vs `app_background_color` | 5.55 | >= 3.0, prefer >= 4.5 |
| `practice_menu_accuracy_bar_track_color` vs `app_background_color` | 1.64 | >= 1.3, prefer >= 1.5 |
| `practice_menu_accuracy_bar_fill_color` vs `practice_menu_accuracy_bar_track_color` | 3.38 | >= 2.0, prefer >= 3.0 |

For generated themes, the accuracy bar should be polarity-aware:

```text
Light theme:
  fill: darker than app_background_color
  track: slightly darker than app_background_color

Dark theme:
  fill: brighter than app_background_color
  track: slightly brighter than app_background_color
```

The existing light samples do not provide a strong active-fill contrast baseline for the accuracy bar, so the generator target should follow the widget requirement rather than preserve that weak sampled behavior.

Every generated theme must include this full contrast-schema role set. If the chosen palette and selected expansion policy cannot produce valid assignments for these roles, generation should stop with named failures instead of producing a visually broken theme.

The generator should also deliberately set derived visual tokens that are currently stored in theme JSON:

```text
media_video_overlay_surface_color
media_video_overlay_backdrop_color
app_surface_shadow
learning_card_performance_divider_color
app_loading_overlay_color
app_button_border_darkness
app_button_hover_darkness
```

For a first version, these may be deterministic `color-mix()` expressions based on assigned semantic roles. They should be emitted intentionally and explained, not omitted as accidental registry defaults.

Non-color theme fields should be copied from the selected base theme unless the wizard step explicitly controls them:

```text
themeName
practice_menu_underlay_image_url
practice_menu_welcome_html
practice_menu_first_practice_welcome_html
brand_display_label
brand_logo_url
brand_favicon_16_url
brand_favicon_32_url
brand_apple_touch_icon_url
brand_android_icon_192_url
brand_android_icon_512_url
brand_android_maskable_icon_192_url
brand_android_maskable_icon_512_url
auth_sign_in_description
app_font_stylesheet_url
app_font_family
app_heading_font_family
app_border_radius_sm
app_border_radius_lg
app_transition_instant
app_transition_fast
app_transition_smooth
```

Copying from the selected base theme is an explicit base-theme inheritance rule, not a hidden fallback.

## Theme Generation

Generate one deterministic theme from the selected palette, polarity, contrast priority, expansion policy, wizard Density percentage, and canonical relationship schema. Do not include a candidate-selection step in the wizard.

Use constrained assignment for the first version:

```ts
const expandedPalette = expandPalette(inputPalette, expansionOptions);
const classified = classifyColors(expandedPalette);
const contrastSchema = buildContrastSchema(wizardDensity, contrastPriority);
const roleOptions = buildRoleOptions(
  classified,
  polarityOptions,
  wizardDensity,
  contrastSchema
);
const generatedTheme = assignThemeRoles(
  roleOptions,
  scoreAssignmentAgainstContrastSchema
);
const finalTheme = applyWizardDensity(generatedTheme, wizardDensity);
const diagnostics = validateThemeAgainstContrastSchema(finalTheme, contrastSchema);
```

The generator should return explanation metadata with the generated theme:

```ts
type GeneratedTheme = {
  id: string;
  properties: Record<string, unknown>;
  scores: ThemeGenerationScores;
  diagnostics: ThemeDiagnostics;
  explanation: string[];
};
```

## Scoring

Contrast schema compliance starts immediately after palette selection/expansion. The generator should use the schema to construct role options, score assignments, and validate the complete generated theme. A generated theme with unresolved required contrast failures is invalid and must not be created.

Initial scoring:

```text
0.40 text readability
0.20 button readability
0.15 required distinctness and role fit
0.10 feedback distinctiveness
0.10 palette fidelity
0.05 aesthetic coherence
```

Adjustments:

```text
text readability weight += contrast_weight
text readability weight += wizard density contrast boost
button readability weight += wizard density contrast boost * 0.5
palette fidelity weight -= contrast_weight * 0.5
```

Hard constraints:

```text
app_background_color vs app_text_color
app_background_color vs app_page_header_text_color
app_primary_action_surface_color vs app_primary_action_text_color
app_secondary_surface_color vs app_secondary_text_color
navigation_surface_color vs navigation_text_color
learning_card_surface_color vs app_text_color
learning_card_stimulus_surface_color vs app_text_color
learning_card_primary_action_surface_color vs learning_card_primary_action_text_color
practice_menu_accuracy_bar_fill_color vs practice_menu_accuracy_bar_track_color
practice_menu_accuracy_bar_fill_color vs app_background_color
practice_menu_accuracy_bar_track_color vs app_background_color
```

Distinctness checks:

```text
app_background_color vs learning_card_surface_color
learning_card_surface_color vs learning_card_stimulus_surface_color
app_primary_action_surface_color vs app_secondary_surface_color
feedback_correct_color vs feedback_error_color
feedback_correct_color vs app_accent_color
feedback_error_color vs app_accent_color
navigation_surface_color vs app_background_color
practice_menu_accuracy_bar_fill_color vs practice_menu_accuracy_bar_track_color
```

Accuracy bar thresholds:

```text
fill vs app background: target >= 3.0, prefer >= 4.5 when palette allows
track vs app background: target >= 1.3, prefer >= 1.5
fill vs track: target >= 2.0, prefer >= 3.0
```

These are non-text visual-indicator thresholds, not body-text WCAG thresholds. Contrast priority and wizard Density may raise them, but should not lower the minimums.

Use WCAG contrast for readability and Delta E 2000 for distinctness. The current editor only has a local WCAG helper, so the wizard should move reusable color math into a dedicated client/common module with unit tests.

## Preview Screen

Show the generated theme preview inline in the theme page.

The preview should include:

```text
mini app background
navigation strip
learning card
stimulus area
primary button
secondary surface
correct/error feedback samples
accuracy bar fill and track
```

The generated theme should show:

```text
Readability
Surface separation
Palette fidelity
Feedback distinctiveness
Density
AA/AAA summary
```

Add an "Explain" disclosure with concise reasoning:

```text
Text colors use generated near-black because the source palette lacked a dark neutral.
Card/stimulus separation is moderate, Delta E = 14.2.
Error feedback was generated as a red companion because the source palette lacked an error color.
Density 50% raised the text contrast target.
```

## Generate And Activate

Action:

```text
Generate Theme
```

Final-step behavior:

- The wizard creates one complete custom theme.
- On successful generation, call `createThemeFromBase({ name, baseThemeId, properties, activate: true })`.
- The newly generated theme becomes the active theme immediately.
- After activation, return the user to the normal theme editor/library context where existing manual edit and export tools remain available.

Do not add a final choice screen for preview-only, apply-to-draft, save-without-activate, or export. Validation failures should block theme creation and show diagnostics before the server method is called.

## Suggested Modules

Use TypeScript modules that match the current app stack:

```text
mofacts/common/themeRoleSchema.ts
- current semantic role list
- required contrast pairs
- required distinctness pairs
- generated-token policy

mofacts/common/themeWizardDensity.ts
- percentage-to-density-field conversion
- proportional font/control sizing helpers
- validation helpers

mofacts/client/lib/themeColorMetrics.ts
- parse supported color inputs
- luminance
- WCAG contrast
- RGB/HSL/Lab
- Delta E 2000

mofacts/client/lib/themePaletteExpansion.ts
- generate tints
- generate shades
- generate muted variants
- classify colors

mofacts/client/lib/themeGenerator.ts
- build role options
- assign theme roles
- score assignments
- return one generated theme, diagnostics, and explanation

mofacts/client/views/themeGenerationWizard.ts
- Blaze event/helper state for the inline wizard
- integration with theme.ts

mofacts/client/views/themeGenerationWizard.html
- Blaze partial, included by theme.html
```

Do not add `.tsx` files unless the project first adopts React for this route.

## Milestones

Milestone 1:

```text
Choose palette colors
Choose light/dark
Choose Density percentage
Generate one complete theme
Activate generated theme
```

Milestone 2:

```text
Start from selected theme/current/default
Palette JSON upload
Contrast priority slider
Expansion controls
Generated-theme explanation
```

Milestone 3:

```text
Inline diagnostics
Unit tests for metrics, expansion, wizard density mapping, role schema, and scoring
```

Milestone 4:

```text
Advanced diagnostics:
WCAG matrix
Delta E matrix
Luminance profile
Color role table
Skipped/unresolved CSS values
```

## Verification Plan

For implementation work:

- Run `npm run typecheck` from `mofacts/` after TypeScript changes.
- Run `npm run lint` from `mofacts/` after lintable TypeScript/HTML-adjacent changes.
- For UI behavior, use the native hotfix dev loop and the MoFaCTS Playwright sidecar against `http://host.docker.internal:3200`.
- Add unit tests for pure generator modules. Do not rely on manual preview alone for color constraint behavior.

## Core Design Principle

The generator should treat a theme as a constrained semantic assignment problem:

```text
Given:
  a source palette
  a palette expansion policy
  a selected base theme
  a target polarity
  a contrast priority
  a wizard Density percentage
  the current MoFaCTS theme role schema

Find:
  complete current MoFaCTS theme properties
  while satisfying contrast, distinctness, polarity, wizard density mapping, and explicit base-theme inheritance rules
```

The wizard should invert diagnostics into construction: once the palette exists, use the 19-pair contrast schema, WCAG, and Delta E metrics to build one valid generated theme, then explain the assignments so admins can trust and edit the result.
