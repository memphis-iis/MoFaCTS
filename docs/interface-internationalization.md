# Interface Internationalization

MoFaCTS separates platform interface language from authored instructional content.

The platform can show MoFaCTS-owned interface text, navigation, account flows, controls, status messages, accessibility labels, and basic system prompts in the configured UI locale. Authored lesson content remains under author control.

## Target UI Locales

The initial target UI locale set is:

| Language | UI locale | Direction | Primary platform TTS code |
| --- | --- | --- | --- |
| English | `en` | LTR | `en-US` |
| Mandarin Chinese | `zh-Hans` | LTR | `cmn-CN` |
| Hindi | `hi` | LTR | `hi-IN` |
| Spanish | `es` | LTR | `es-ES` |
| Standard Arabic | `ar` | RTL | `ar-XA` |
| French | `fr` | LTR | `fr-FR` |
| Bengali | `bn` | LTR | `bn-IN` |
| Portuguese | `pt` | LTR | `pt-BR` |
| Indonesian | `id` | LTR | `id-ID` |
| Urdu | `ur` | RTL | `ur-IN` |

Locale resources are checked in with AI-draft strings. The runtime locale definitions track review status explicitly: English is the enabled baseline, and the other initial target locales remain draft until qualified human review marks them ready for production enablement.

Authenticated users can choose their interface language from the account menu in the top-right app header or from their Profile page. The selection is saved as the user's UI locale preference.

## Authored Content

MoFaCTS does not automatically translate lessons. Content authors provide and validate prompts, answers, hints, feedback, assessments, rubrics, and KC labels.

TDF lesson metadata may describe authored content with:

- `contentLanguage`: BCP 47 language tag for authored instructional content.
- `recommendedUiLocales`: optional UI locales recommended for the lesson.
- `translationStatus`: author-declared review status for the content language variant.

These fields describe content; they do not request translation.

## Input And Audio

Learner text inputs are Unicode-capable and may use the declared content language for `lang` and text direction. Answer matching supports Unicode normalization plus author-controlled `caseSensitive` and `accentSensitive` delivery settings.

Speech recognition remains opt-in through lesson and learner audio settings. Selecting a UI locale does not request microphone permission or imply speech recognition support for that language.

Speech recognition defaults to English (`en-US`) when no language is specified, including missing lessons and missing, null, blank or empty repeated values. Existing lesson configurations do not need a language field added. An optional `speechRecognitionLanguage` override selects a supported Google Speech-to-Text code; repeated authored values retain their first nonblank selection. Explicit malformed or unsupported codes report a configuration error. Changing the interface locale does not change either the English default or an explicit recognition-language choice.

Platform-owned prompt TTS uses the selected UI locale's explicit primary TTS code. Authored lesson TTS remains separate and follows the lesson/content TTS configuration supplied by the author.

## Failure Behavior

MoFaCTS should fail clearly when a supported UI locale is missing required platform strings, when an unsupported locale is requested, or when a platform prompt needs a TTS voice locale that is not available. It should not silently substitute English or translate authored content at runtime.
