export type ThemePolarity = 'light' | 'dark';
export type ThemeContrastPairKind = 'text' | 'indicator' | 'track';

export type ThemeContrastPair = {
  foreground: string;
  background: string;
  minimum: number;
  preferred: number;
  kind: ThemeContrastPairKind;
};

export type ThemeDistinctnessPair = {
  first: string;
  second: string;
  minimumDeltaE: number;
};

export const THEME_GENERATOR_ROLE_PROPERTIES = [
  'app_background_color',
  'app_text_color',
  'app_page_header_text_color',
  'app_primary_action_surface_color',
  'app_primary_action_text_color',
  'app_accent_color',
  'app_secondary_surface_color',
  'app_secondary_text_color',
  'learning_card_audio_icon_disabled_color',
  'learning_card_audio_control_color',
  'feedback_correct_color',
  'feedback_error_color',
  'navigation_text_color',
  'navigation_surface_color',
  'learning_card_surface_color',
  'learning_card_stimulus_surface_color',
  'learning_card_primary_action_surface_color',
  'learning_card_primary_action_text_color',
  'practice_menu_accuracy_bar_fill_color',
  'practice_menu_accuracy_bar_track_color',
] as const;

export const THEME_GENERATOR_DERIVED_PROPERTIES = [
  'media_video_overlay_surface_color',
  'media_video_overlay_backdrop_color',
  'app_surface_shadow',
  'learning_card_performance_divider_color',
  'app_loading_overlay_color',
  'app_button_border_darkness',
  'app_button_hover_darkness',
] as const;

export function buildThemeContrastSchema(
  densityContrastBoost = 0,
  contrastWeight = 0.5,
): ThemeContrastPair[] {
  const readabilityPreferred = 7 + densityContrastBoost * 1.5 + contrastWeight;
  const text = (foreground: string, background: string): ThemeContrastPair => ({
    foreground,
    background,
    minimum: 4.5,
    preferred: readabilityPreferred,
    kind: 'text',
  });

  return [
    text('app_text_color', 'app_background_color'),
    text('app_page_header_text_color', 'app_background_color'),
    text('app_primary_action_text_color', 'app_primary_action_surface_color'),
    text('app_secondary_text_color', 'app_secondary_surface_color'),
    text('navigation_text_color', 'navigation_surface_color'),
    text('app_text_color', 'learning_card_surface_color'),
    text('app_text_color', 'learning_card_stimulus_surface_color'),
    text('learning_card_primary_action_text_color', 'learning_card_primary_action_surface_color'),
    text('feedback_correct_color', 'learning_card_surface_color'),
    text('feedback_error_color', 'learning_card_surface_color'),
    {
      foreground: 'practice_menu_accuracy_bar_fill_color',
      background: 'app_background_color',
      minimum: 3,
      preferred: 4.5 + densityContrastBoost,
      kind: 'indicator',
    },
    {
      foreground: 'practice_menu_accuracy_bar_track_color',
      background: 'app_background_color',
      minimum: 1.3,
      preferred: 1.5 + densityContrastBoost * 0.25,
      kind: 'track',
    },
    {
      foreground: 'practice_menu_accuracy_bar_fill_color',
      background: 'practice_menu_accuracy_bar_track_color',
      minimum: 2,
      preferred: 3 + contrastWeight * 0.5,
      kind: 'indicator',
    },
  ];
}

export const THEME_GENERATOR_DISTINCTNESS_PAIRS: ThemeDistinctnessPair[] = [
  { first: 'app_background_color', second: 'learning_card_surface_color', minimumDeltaE: 3 },
  { first: 'learning_card_surface_color', second: 'learning_card_stimulus_surface_color', minimumDeltaE: 3 },
  { first: 'app_primary_action_surface_color', second: 'app_secondary_surface_color', minimumDeltaE: 10 },
  { first: 'feedback_correct_color', second: 'feedback_error_color', minimumDeltaE: 20 },
  { first: 'feedback_correct_color', second: 'app_accent_color', minimumDeltaE: 10 },
  { first: 'feedback_error_color', second: 'app_accent_color', minimumDeltaE: 10 },
  { first: 'navigation_surface_color', second: 'app_background_color', minimumDeltaE: 3 },
  { first: 'practice_menu_accuracy_bar_fill_color', second: 'practice_menu_accuracy_bar_track_color', minimumDeltaE: 10 },
];
