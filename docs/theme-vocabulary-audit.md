# Theme Vocabulary Audit

MoFaCTS theme properties are stored in snake_case and emitted as CSS custom
properties in kebab-case. The stored theme JSON is the source of truth.

The current vocabulary describes product surfaces and semantic roles instead of
component-local aliases. Legacy names are accepted only while loading or
importing themes, where they are migrated into the current names.

## Taxonomy

| Prefix | Surface |
| --- | --- |
| `app_*` | Whole-app foundations, typography, action controls, timing, and global layout tokens |
| `navigation_*` | Header, sidebar, and navigation chrome |
| `practice_menu_*` | Home practice menu and dashboard-specific content |
| `learning_card_*` | Trial/card runtime UI and learning interaction surfaces |
| `feedback_*` | Correctness, error, success, and response state colors |
| `media_*` | Video and embedded media overlays |
| `auth_*` | Sign-in and sign-up surfaces |
| `brand_*` | Logos, labels, icons, and install metadata |

## Rename Map

| Legacy property | Current property |
| --- | --- |
| `background_color` | `app_background_color` |
| `text_color` | `app_text_color` |
| `page_header_text_color` | `app_page_header_text_color` |
| `button_color` | `app_primary_action_surface_color` |
| `primary_button_text_color` | `app_primary_action_text_color` |
| `accent_color` | `app_accent_color` |
| `secondary_color` | `app_secondary_surface_color` |
| `secondary_text_color` | `app_secondary_text_color` |
| `audio_icon_disabled_color` | `learning_card_audio_icon_disabled_color` |
| `audio_control_color` | `learning_card_audio_control_color` |
| `success_color` | `feedback_correct_color` |
| `alert_color` | `feedback_error_color` |
| `navbar_text_color` | `navigation_text_color` |
| `neutral_color` | `navigation_surface_color` |
| `card_background_color` | `learning_card_surface_color` |
| `stimuli_box_color` | `learning_card_stimulus_surface_color` |
| `video_overlay_surface_color` | `media_video_overlay_surface_color` |
| `video_overlay_backdrop_color` | `media_video_overlay_backdrop_color` |
| `surface_shadow` | `app_surface_shadow` |
| `performance_divider_color` | `learning_card_performance_divider_color` |
| `loading_overlay_color` | `app_loading_overlay_color` |
| `main_button_color` | `learning_card_primary_action_surface_color` |
| `main_button_text_color` | `learning_card_primary_action_text_color` |
| `home_hero_image_url` | `practice_menu_underlay_image_url` |
| `home_welcome_html` | `practice_menu_welcome_html` |
| `home_no_practice_welcome_html` | `practice_menu_first_practice_welcome_html` |
| `brand_label` | `brand_display_label` |
| `logo_url` | `brand_logo_url` |
| `favicon_16_url` | `brand_favicon_16_url` |
| `favicon_32_url` | `brand_favicon_32_url` |
| `apple_touch_icon_url` | `brand_apple_touch_icon_url` |
| `android_icon_192_url` | `brand_android_icon_192_url` |
| `android_icon_512_url` | `brand_android_icon_512_url` |
| `android_maskable_icon_192_url` | `brand_android_maskable_icon_192_url` |
| `android_maskable_icon_512_url` | `brand_android_maskable_icon_512_url` |
| `signInDescription` | `auth_sign_in_description` |
| `border_radius_sm` | `app_border_radius_sm` |
| `border_radius_lg` | `app_border_radius_lg` |
| `transition_instant` | `app_transition_instant` |
| `transition_fast` | `app_transition_fast` |
| `transition_smooth` | `app_transition_smooth` |
| `font_stylesheet_url` | `app_font_stylesheet_url` |
| `font_family` | `app_font_family` |
| `heading_font_family` | `app_heading_font_family` |
| `font_size_base` | `app_font_size_base` |
| `button_height` | `app_button_height` |
| `button_border_darkness` | `app_button_border_darkness` |
| `button_hover_darkness` | `app_button_hover_darkness` |

## New First-Class Properties

| Property | Purpose |
| --- | --- |
| `practice_menu_accuracy_bar_fill_color` | Filled portion of the Overall Accuracy bar on the practice menu |
| `practice_menu_accuracy_bar_track_color` | Track behind the practice menu Overall Accuracy bar |
| `app_text_input_height` | Shared minimum height for text entry controls such as the practice menu search box |

## Invariants

- Theme JSON uses the current snake_case property names.
- Runtime CSS consumes generated kebab-case variables directly, such as `--practice-menu-accuracy-bar-fill-color`.
- Component-local aliases that hide theme meaning are avoided.
- Legacy names are migrated at theme load/import boundaries and are not emitted as CSS variables.
- Required missing values should be supplied by the registry fallback or fail clearly.
