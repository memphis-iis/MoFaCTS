# MoFaCTS Interface Internationalization Plan

This plan frames MoFaCTS internationalization as platform interface localization plus language-agnostic authored content delivery. It does not frame MoFaCTS as a system that automatically translates courses.

This document is an implementation handoff plan for the coding team. It is developer-facing and belongs in `docs-developer/` until implementation produces stable public authoring, operator, or release behavior that needs concise public documentation.

## Readiness Summary

Implementation is ready to begin when the team treats these as hard constraints:

- Work in the active MoFaCTS application surfaces under `mofacts/`, with learning-component response behavior in `learning-components/` when unit-engine scoring contracts are involved.
- Treat `C:\dev\mofacts_config` as the authoritative companion content/config repository for compatibility checks before adding or renaming TDF fields, package metadata, config keys, schema fields, or generated schema output.
- Treat `C:\dev\MoFaCTS.wiki` as the place for longer product/developer documentation after the implementation shape stabilizes.
- Before touching config or wiki work, verify `MOFACTS_CONFIG_REPO` and `MOFACTS_WIKI_REPO` when present. If either points somewhere other than `C:\dev\mofacts_config` or `C:\dev\MoFaCTS.wiki`, stop and report the mismatch. If absent, use the canonical paths after verifying they exist.
- Do not add silent fallback behavior. Missing locale resources, invalid locale tags, missing required translation keys, missing voice mappings, and missing declared speech-recognition language for SR-enabled lessons must fail clearly.
- Do not add new npm, Meteor, Docker, or system dependencies unless an implementation decision explicitly proves the existing stack is insufficient and the user approves the dependency.
- Do not run Docker build, push, deploy, release, or production-affecting commands for this work unless explicitly requested.
- Do not translate authored instructional content as part of platform i18n.
- Do not make microphone access a side effect of locale selection.

Current evidence checked for this handoff:

- `C:\dev\mofacts_config` and `C:\dev\MoFaCTS.wiki` both exist on this workstation.
- Current config content already uses `speechRecognitionLanguage` and `textToSpeechLanguage` in at least one package.
- No current config hit was found for adjacent metadata names before introducing the canonical TDF metadata fields `contentLanguage`, `recommendedUiLocales`, and `translationStatus`.
- No existing app dependency hit was found for `i18next`, `FormatJS`, `react-intl`, `intl-messageformat`, or `@formatjs` in the checked package files.

## Product Position

MoFaCTS should be able to deliver authored learning content in any language while the platform interface, navigation, account flows, authoring controls, learner controls, and system messages are localized independently.

The product claim should be:

> MoFaCTS supports learning content authored in multiple languages. The platform interface can be localized independently from instructional content, allowing learners and authors to use MoFaCTS in languages such as Spanish, Chinese, and Hindi while preserving authorial control over educational materials. MoFaCTS does not automatically translate instructional content; content authors provide and validate language-specific prompts, answers, hints, feedback, and assessments.

## Core Distinction

MoFaCTS needs three separable language concepts:

| Layer | Meaning | Owner | Example |
| --- | --- | --- | --- |
| UI locale | Language of platform chrome and system strings | User, institution, browser, deployment configuration, or application configuration | Menus, buttons, dashboard labels, "Submit", "Review due" |
| Content language | Language instructional material is authored in | Content author | Spanish anatomy deck, Chinese vocabulary deck, Hindi math explanations |
| Learner response language / input mode | Scripts, normalization, matching, and input behavior allowed for learner responses | Activity design and content author | Chinese characters, Hindi Devanagari, Spanish accents, mixed transliteration |

These layers must remain independent. A learner may use the English UI while studying Chinese content, or use the Spanish UI while studying English vocabulary.

In this plan, "platform-owned system prompts" means user-facing MoFaCTS system messages and instructional chrome, such as sign-in prompts, validation prompts, confirmation prompts, permission copy, status text, and practice-control prompts. It does not mean hidden LLM system prompts for AutoTutor unless a later implementation task explicitly localizes an end-user-visible AutoTutor platform message.

## Goals

- Localize platform strings independently from authored educational content.
- Add explicit content-language metadata to packages and TDF-derived content without implying platform-owned translation.
- Make learner input and answer display language-agnostic across Unicode scripts.
- Preserve authorial control over prompts, hints, worked examples, feedback, distractors, answer keys, rubrics, and KC labels.
- Support AI-assisted first-pass translation for every platform-owned UI string and system prompt in each initial target language.
- Keep translation files versioned, auditable, and reviewable by qualified humans.
- Avoid fallback behavior when a requested locale or content-language invariant is missing.

## Non-Goals

- Do not automatically translate instructional content.
- Do not translate TDF prompts, hints, examples, explanations, distractors, misconception feedback, answer keys, scoring rubrics, or teacher/research KC labels unless a content author explicitly creates and reviews that authored variant.
- Do not introduce new npm, Meteor, Docker, or system dependencies without explicit approval.
- Do not add compatibility paths that mask missing locale files, missing content-language metadata, or invalid language tags.
- Do not treat speech recognition language codes as a substitute for content-language or UI-locale metadata.

## Language Metadata Model

Use BCP 47 language tags for both interface locales and content metadata. Examples include `en`, `es`, `zh-Hans`, `zh-Hant`, and `hi`.

Canonical TDF metadata fields:

- `contentLanguage`: BCP 47 language tag for authored instructional content.
- `recommendedUiLocales`: optional BCP 47 UI locale tags recommended for platform chrome.
- `translationStatus`: author-declared review status for the authored content language variant.

## Initial Target Language Set

The initial invariant target is the top ten languages by total speakers using the Ethnologue 2026 list as the source of truth: https://www.ethnologue.com/insights/ethnologue200/

| Language | UI locale target | Primary TTS code | Input/display target |
| --- | --- | --- | --- |
| English | `en` | `en-US` | Latin script, English punctuation and casing |
| Mandarin Chinese | `zh-Hans` | `cmn-CN` | Simplified Chinese display, CJK input, IME composition |
| Hindi | `hi` | `hi-IN` | Devanagari display and input |
| Spanish | `es` | `es-ES` | Latin accents, accent-sensitive and accent-insensitive matching controls |
| Standard Arabic | `ar` | `ar-XA` | Arabic display and right-to-left layout readiness |
| French | `fr` | `fr-FR` | Latin accents, apostrophes, elision, and locale-aware formatting |
| Bengali | `bn` | `bn-IN` | Bengali script display and input |
| Portuguese | `pt` | `pt-BR` | Latin accents and locale-aware formatting |
| Indonesian | `id` | `id-ID` | Latin script and locale-aware formatting |
| Urdu | `ur` | `ur-IN` | Urdu display, right-to-left layout readiness, and input |

For these ten languages, success requires these separate capabilities:

- Every platform-owned UI string and system prompt has a non-empty AI-generated draft translation in the locale resource files.
- Learners can see system prompts in the selected UI locale and can type learner responses in the target language's expected scripts without input corruption, display corruption, or English-only answer-normalization assumptions.
- Platform-owned system prompts can be spoken in the selected UI locale by resolving that locale to the target language's primary TTS code unless an explicit reviewed voice-locale override is configured.

AI-generated strings are draft assets, not production approval. Each locale still needs qualified review before production enablement.

Platform UI strings should live in locale resources:

```text
MoFaCTS platform strings
  en: "Submit"
  es: "Enviar"
  zh-Hans: "提交"
  hi: "जमा करें"
  ar: "إرسال"
  fr: "Envoyer"
  bn: "জমা দিন"
  pt: "Enviar"
  id: "Kirim"
  ur: "جمع کریں"
```

Authored content should declare language metadata while keeping instructional text in the content package:

```json
{
  "contentLanguage": "es",
  "title": "Sistema esquelético",
  "author_declared_language": true
}
```

Course or package-level metadata should summarize available authored languages and recommended interface locales:

```json
{
  "contentLanguages": ["es"],
  "recommendedUiLocales": ["es", "en"],
  "translationStatus": "author-provided"
}
```

## Dependency Direction

Prefer the existing platform stack and browser-native `Intl` APIs first.

- First implementation pass: use a small MoFaCTS-owned locale resource loader and typed translation helper if that satisfies string lookup, interpolation, missing-key detection, and tests without a new dependency.
- Core UI i18n candidate: `i18next` or `FormatJS`, only after an implementation audit proves the local helper approach is insufficient and explicit dependency approval is granted.
- Locale-aware formatting: browser `Intl` APIs for dates, times, numbers, percentages, and list formatting.
- Polyfills: FormatJS polyfills only if current browser support and target deployment evidence require them.
- Content language metadata: BCP 47 tags stored with TDF/package/course metadata.
- Input normalization: MoFaCTS-owned answer-normalization and scoring layer, not translation software.

Dependency decision gate:

1. Search `mofacts/package.json`, lockfiles, current client/server helpers, and adjacent locale/formatting utilities before proposing a dependency.
2. Document the missing capability that the existing stack cannot cover.
3. Get explicit user approval for any new dependency before editing package manifests.
4. Restart the hotfix dev service deliberately if dependency or Meteor package changes are made.

## Architecture And File Ownership

Suggested implementation ownership:

- Locale constants, BCP 47 validation, target-locale definitions, and UI-locale-to-TTS-code mapping should live in `mofacts/common/` so client, server, schema generation, and tests share one source of truth.
- Client translation lookup, locale selection, formatting helpers, directionality helpers, and missing-key reporting should live in `mofacts/client/lib/` unless existing local patterns indicate a more specific owner.
- App shell, Blaze templates, Svelte components, dashboard UI, practice controls, account flows, admin pages, and authoring pages should consume the shared translation helper rather than importing locale files directly.
- TTS runtime changes belong near `mofacts/client/views/experiment/svelte/services/ttsService.ts` and existing audio state/helpers, with shared language constants imported from `common/`.
- Speech-recognition gating changes belong near `mofacts/client/lib/audioAvailability.ts`, `mofacts/client/lib/speechRecognitionConfig.ts`, `mofacts/client/lib/audioStartup.ts`, and `mofacts/client/views/experiment/svelte/services/speechRecognitionService.ts`.
- Answer normalization and scoring controls belong in the current answer-assessment/unit-runtime owners, and in `learning-components/` when the behavior is owned by a unit engine rather than Meteor UI.
- Server methods should only be added for persistence, authentication/authorization, database access, secrets, or provider calls that cannot safely run on the client. Do not add pure locale-formatting or translation-lookup methods to `mofacts/server/methods.ts`.
- Locale resource files must be source files, not generated local artifacts. If AI-generated drafts are produced by a repeatable script, store only the curated locale resources and keep one-off prompts, raw outputs, or scratch inventories out of tracked root `outputs/` and `tmp/`.

Implementation should add an explicit source-of-truth module before broad UI conversion. Do not scatter hard-coded locale lists, TTS mappings, or directionality checks across templates and components.

## Naming And Schema Discipline

Before adding any field, key, schema property, or package metadata:

1. Search `mofacts/`, `learning-components/`, and `C:\dev\mofacts_config` for existing language, locale, speech, TTS, content metadata, package metadata, and translation status concepts.
2. If redundant concepts already exist, stop and resolve the duplication before building on it.
3. Choose one canonical name per concept and document its owner, allowed values, and whether it is required.
4. If TDF field registries or generated schemas change, run `npm run generate:schemas` from `mofacts/` and inspect generated schema diffs.
5. If dependent config packages need updates, make those changes in `C:\dev\mofacts_config`; do not clone, substitute, or create a replacement config repo.

Initial concept ownership:

| Concept | Proposed owner | Notes |
| --- | --- | --- |
| UI locale | Platform/user/institution/deployment setting | Drives platform chrome, formatting, directionality, and platform-owned prompt TTS. |
| Content language | Author/package metadata | Describes authored instructional material; does not trigger translation. |
| Learner response language/input mode | Activity/unit authoring metadata | Drives normalization, accepted scripts, transliteration, and matching options. |
| Speech-recognition language | Lesson speech configuration | Used only when SR is explicitly enabled. |
| Platform TTS locale | UI locale plus explicit voice-locale override | Drives platform-owned prompt speech. |
| Authored content TTS language | Lesson/content TTS configuration | Drives spoken authored prompts/feedback when author supplied. |

## Surfaces To Localize

Localize platform-owned UI strings:

- Login, registration, password, and account screens.
- Learner dashboard and course navigation.
- Practice controls such as submit, next, show answer, review later, and try again.
- Scheduling and review status messages.
- Progress displays, summaries, and chart labels.
- Error, warning, success, and empty-state messages.
- Platform-owned system prompts and instructional chrome, including prompts such as sign-in prompts, permission prompts, validation prompts, confirmation prompts, and practice-state prompts.
- Authoring interface labels and controls.
- Analytics labels and table headers.
- Accessibility labels and ARIA text.
- Date, time, number, and percent formatting.
- Basic system feedback such as correct, incorrect, try again, show answer, and review due.

Keep authored content under content-author control:

- Prompts.
- Hints.
- Worked examples.
- Explanations.
- Distractors.
- Misconception-specific feedback.
- Domain vocabulary.
- Answer keys.
- Scoring rubrics.
- KC labels that carry teacher or research meaning.

## Existing MoFaCTS Surfaces To Audit

Before implementation, audit the current code paths that already use language concepts:

- TDF field registry entries for speech recognition and text-to-speech language codes in `mofacts/common/tdfFieldRegistries.ts`.
- Speech recognition configuration and launch gating in `mofacts/client/lib/speechRecognitionConfig.ts`, `mofacts/client/lib/audioStartup.ts`, and speech-recognition services.
- TTS language and voice selection in `mofacts/client/views/experiment/svelte/services/ttsService.ts`, including the current `textToSpeechLanguage`, voice-prefix, and `en-US` resolution behavior.
- Spanish phonetic strategy routing in `mofacts/client/lib/phoneticMatchingByLanguage.ts`.
- Answer comparison and normalization in `mofacts/client/views/experiment/answerAssess.ts` and adjacent runtime scoring paths.
- Manual content creation validation for speech language fields.
- Dashboard and admin sort paths that currently use `localeCompare`, including any hard-coded English locale arguments.

The audit deliverable is a short map of existing language-related fields, what each one means, and which of the three language layers it belongs to.

## Speech Recognition And TTS Integration

Internationalized UI must integrate with the existing audio runtime without merging UI locale, content language, speech recognition language, and TTS language into one concept.

Speech recognition requirements:

- Speech recognition remains strictly opt-in through lesson/runtime audio controls.
- Supporting UI locale, text input, and display for the ten initial target languages does not require speech recognition support for those languages.
- `speechRecognitionLanguage` remains a speech-to-text configuration for microphone transcription, not the source of truth for UI locale or content language.
- If a lesson enables speech recognition, it must declare an explicit speech-recognition language supported by the speech provider.
- The locale plan must not trigger microphone permission prompts merely because a learner selects a non-English UI locale.
- UI locale can localize speech-recognition controls, status labels, permission copy, and error messages even when speech recognition itself is unavailable for that locale.

TTS requirements:

- Platform-owned system prompts should speak in the selected UI locale.
- Locale-to-TTS resolution must use an explicit mapping for the initial target locale set, because most languages have multiple possible regional voices.
- The primary TTS code is the invariant target for each initial UI locale: `en` -> `en-US`, `zh-Hans` -> `cmn-CN`, `hi` -> `hi-IN`, `es` -> `es-ES`, `ar` -> `ar-XA`, `fr` -> `fr-FR`, `bn` -> `bn-IN`, `pt` -> `pt-BR`, `id` -> `id-ID`, and `ur` -> `ur-IN`.
- A deployment, institution, authoring surface, or learner profile may later choose a reviewed voice-locale variant, such as `es-US`, `pt-PT`, `fr-CA`, `cmn-TW`, or `en-GB`, but that variant must be explicit and visible.
- Do not silently substitute a different language when the selected locale has no usable TTS voice. Report the missing voice-locale condition clearly and keep text display available.
- Author-controlled content TTS remains separate. Authored lesson prompts and feedback should use the content or lesson TTS configuration when the author has supplied one, not the UI locale merely because the platform chrome is localized.
- When TTS speaks platform-owned prompts around authored content, the spoken system prompt must not imply that authored instructional content has been translated.

Implementation should replace the current hard-coded TTS-language resolution behavior with a documented resolver that takes the selected UI locale, optional explicit voice-locale override, authored content TTS settings, requested voice, and available provider/browser voices as separate inputs, then either selects an explicit allowed voice-locale or reports the missing voice condition clearly.

The first implementation should also add tests for the resolver. Minimum cases:

- Each initial UI locale resolves to its primary TTS code.
- Explicit reviewed overrides win only when they are allowed and visible.
- Missing or unsupported voice-locale conditions produce a clear error/result, not an implicit `en-US` substitution.
- Authored content TTS language is preserved when speaking authored lesson text.
- Platform prompt TTS does not alter SR eligibility or request microphone access.

## Input And Display Requirements

MoFaCTS must be language-agnostic at the input and display level, even when content is not translated.

Required capabilities:

- Unicode-safe storage, transport, display, logging, export, and import.
- Right-to-left readiness for Arabic and Urdu in the initial target set, with the same layout discipline supporting future Hebrew.
- IME composition event support for Chinese, Japanese, and Korean input.
- Accent-sensitive and accent-insensitive matching options for Spanish and similar languages.
- Unicode normalization for composed and decomposed characters.
- Author-enabled transliteration-aware scoring where pedagogically appropriate.
- Fonts and layout behavior that support Devanagari, CJK, Latin accents, and other common scripts.
- Tokenization, casing, word-boundary, and answer-matching logic that does not assume English.
- Right-to-left display and input behavior for Arabic and Urdu system prompts and learner responses.
- Locale-specific smoke coverage for typing learner responses in English, Mandarin Chinese, Hindi, Spanish, Standard Arabic, French, Bengali, Portuguese, Indonesian, and Urdu.
- Speech-recognition controls and microphone permission copy localized independently from whether speech recognition is supported for the selected UI locale.
- TTS playback for platform-owned system prompts in the primary TTS code for each initial target locale.

Examples:

- Spanish answer checking may need an author-controlled decision about whether `corazon` matches `corazón`.
- Hindi answer checking may require normalization of Devanagari forms.
- Chinese content cannot assume whitespace-delimited word boundaries.

These are scoring and input-design issues, not translation issues.

## Proposed Phases

### Phase 1: Inventory And Policy

1. Inventory all visible platform strings in learner, admin, authoring, account, and practice flows.
2. Classify each string as platform-owned, content-authored, mixed, or diagnostic/developer-only.
3. Audit existing language-related fields and code paths.
4. Search `mofacts/`, `learning-components/`, and `C:\dev\mofacts_config` for adjacent field names before choosing final metadata names.
5. Treat `en`, `zh-Hans`, `hi`, `es`, `ar`, `fr`, `bn`, `pt`, `id`, and `ur` as the initial target locale set.
6. Write the authoring policy: content translation is author-provided and domain-reviewed.
7. Identify public docs or wiki pages that must be updated when implementation begins.

Deliverables:

- String ownership inventory.
- Language-field map.
- Metadata naming decision record.
- Initial target-locale owner and review-status matrix.
- Authoring policy text.

### Phase 2: Locale Infrastructure

1. Create the canonical target-locale and primary-TTS-code source-of-truth module.
2. Choose the UI i18n mechanism after checking current package availability and dependency constraints.
3. Define locale resource file shape, naming, and folder ownership.
4. Add locale selection rules that choose exactly one configured locale from explicit inputs:
   - explicit user preference,
   - institution or deployment configuration,
   - browser preference when the deployment explicitly permits browser-based selection,
   - application configuration when no user, institution, deployment, or permitted browser preference is present.
5. Fail clearly when selection cannot resolve one configured locale or when a selected supported locale is missing required resources.
6. Add locale-aware formatting helpers for dates, times, numbers, and percentages.
7. Add a locale-to-primary-TTS-code resolver for the initial target locale set.
8. Add development checks that catch unregistered user-visible platform strings where feasible.
9. Add tests for locale selection, missing-key behavior, directionality, formatting, and TTS-code mapping.

Deliverables:

- UI locale resolver.
- UI-locale-to-TTS-language resolver.
- Directionality helper.
- Locale resource structure.
- Formatting helper contract.
- Missing-string validation plan.

### Phase 3: Learner UI Localization

1. Localize account, dashboard, navigation, course listing, and launch surfaces.
2. Localize practice controls and system feedback while preserving authored trial text exactly.
3. Verify that authored prompts, hints, answers, and feedback do not pass through UI translation.
4. Add locale-aware formatting to progress displays and review timing.
5. Smoke test each initial target locale with system prompts visible in that locale and learner response entry in the corresponding target script or input pattern.
6. Smoke test platform-owned system-prompt TTS in the primary TTS code for each initial target UI locale.
7. Smoke test English UI with non-English content and non-English UI with English content.
8. Keep UI changes incremental by route/surface; do not convert unrelated pages merely to create a broad i18n abstraction.

Deliverables:

- Localized learner chrome.
- Localized platform-prompt TTS smoke-test notes.
- Practice runtime boundary verification.
- Mixed-language smoke-test notes.

### Phase 3A: Audio Locale Integration

1. Audit every caller that resolves `textToSpeechLanguage`, `speechRecognitionLanguage`, audio prompt voice IDs, and audio prompt modes.
2. Split platform-prompt TTS language selection from authored lesson/content TTS selection.
3. Route platform-owned system-prompt TTS through the selected UI locale and primary TTS-code mapping.
4. Keep speech recognition gated by explicit lesson/user audio controls and configured speech-recognition language.
5. Localize speech recognition UI, status, permission, and error text without promising speech-to-text coverage for every target locale.
6. Preserve SR/TTS coordination so TTS playback still locks recording and restarts SR only when SR was already eligible.
7. Remove any implicit hard-coded `en-US` TTS behavior from platform-prompt paths unless `en-US` was selected explicitly through the locale/TTS mapping.

Deliverables:

- Audio-language ownership map.
- Platform-prompt TTS resolver.
- SR availability and permission-copy localization notes.

### Phase 4: Authoring And Admin Localization

1. Localize authoring labels, validation messages, import/export controls, and admin navigation.
2. Add content-language metadata editing where TDF/package ownership belongs.
3. Add recommended UI locale metadata for packages or courses where appropriate.
4. Display language metadata clearly without treating it as a translation command.
5. Keep KC labels, content fields, and rubrics author-controlled.
6. If new TDF fields or schema properties are introduced, update generated schemas and inspect diffs before touching config packages.
7. Verify dependent config packages in `C:\dev\mofacts_config` before requiring metadata on existing content.

Deliverables:

- Localized authoring/admin chrome.
- Content-language metadata editing path.
- Package/course language metadata display.
- Config compatibility notes.

### Phase 5: Input Normalization And Scoring Controls

1. Audit existing answer-normalization behavior by unit type and response mode.
2. Define author-controlled matching options for accent sensitivity, Unicode normalization, transliteration, and script-specific comparison.
3. Keep defaults conservative and explicit.
4. Add tests for composed/decomposed Unicode, Spanish accent behavior, Devanagari normalization examples, CJK IME composition, and whitespace-free input.
5. Ensure speech recognition language codes remain opt-in and do not trigger microphone access unless speech recognition is explicitly enabled.
6. Ensure speech-recognition language settings do not override UI locale, TTS locale, or content-language metadata.

Deliverables:

- Answer-normalization contract.
- Author-controlled matching settings.
- Unit/runtime tests for multilingual response handling.

### Phase 6: Translation Workflow For Platform Strings

1. Use AI to create first-pass draft translations for every platform-owned UI string and system prompt across the ten initial target locales: `en`, `zh-Hans`, `hi`, `es`, `ar`, `fr`, `bn`, `pt`, `id`, and `ur`.
2. Store every translated string in versioned locale files.
3. Require qualified human review before enabling a locale in production.
4. Track translation status by locale: draft, reviewed, enabled, deprecated.
5. Preserve string context notes for translators where ambiguity exists.
6. Add review checks for truncation, tone, accessibility text, and control-label fit.
7. Treat missing AI draft strings in any target locale as an implementation failure until the string inventory is explicitly reclassified as non-user-visible or content-authored.
8. Keep raw AI prompt transcripts, bulk model outputs, and scratch translation inventories out of tracked source unless curated as intentional examples with provenance.
9. Do not call external translation APIs from production runtime for platform strings; runtime should use checked-in reviewed locale resources.

Deliverables:

- Translation workflow checklist.
- Locale review status record.
- Translator context notes.
- Complete AI-draft locale resources for the ten initial target locales.

### Phase 7: Documentation And Release Readiness

1. Update concise public docs only when implementation changes contributor setup, authoring behavior, schema fields, local run expectations, deployment settings, or user-facing workflows.
2. Update `C:\dev\MoFaCTS.wiki` when the implementation produces longer product/developer guidance that should not live in public repo docs.
3. Document locale enablement status, review status, supported TTS voice locales, and unsupported SR locales.
4. Record route-level smoke-test evidence for localized UI and audio behavior.

Deliverables:

- Public docs update or explicit "not needed" rationale.
- Wiki update checklist for longer implementation guidance.
- Locale enablement and review-status table.

## Verification Plan

For document-only work, no app verification is required beyond markdown review.

For implementation work, use the verification path that matches the changed files:

- TypeScript-bearing app changes: run `npm run typecheck` from `mofacts/`.
- Lintable TypeScript, JavaScript, or Svelte changes: run `npm run lint` from `mofacts/`.
- TDF field registry or schema changes: run `npm run generate:schemas` from `mofacts/` and inspect generated schema diffs.
- UI/runtime behavior changes: use the native hotfix dev server and MoFaCTS Playwright sidecar smoke tests.
- Meteor integration or client-contract coverage: use CI or another supported Meteor test environment.
- Config/content compatibility changes: inspect and update `C:\dev\mofacts_config` deliberately; do not substitute another config repository.
- Long-form developer/product documentation changes: inspect and update `C:\dev\MoFaCTS.wiki` deliberately when needed.

Minimum automated/unit coverage for implementation:

- Locale selection and missing-resource failure.
- Translation-key lookup, interpolation if used, and missing-key failure.
- Target-locale table completeness for all ten locales.
- UI-locale-to-primary-TTS-code mapping.
- Directionality helper for `ar` and `ur`.
- TTS resolver behavior for explicit overrides, missing voices, authored-content TTS separation, and no implicit `en-US` substitution.
- SR gating behavior proving locale selection alone does not request microphone access.
- Answer normalization for Unicode composed/decomposed forms, Spanish accent policy, Devanagari examples, CJK IME text entry, and RTL typed input where relevant.

Suggested smoke scenarios:

- English UI with Spanish authored content.
- Spanish UI with English authored content.
- Chinese authored content with IME input.
- Hindi authored content with Devanagari display and answer entry.
- Arabic and Urdu UI prompts with right-to-left display and learner response entry.
- Bengali learner response entry and display.
- Platform-owned prompt TTS speaks with primary TTS codes for all ten initial target UI locales.
- Selecting a non-English UI locale does not request microphone access unless speech recognition is explicitly enabled.
- Spanish answer matching with accent-sensitive and accent-insensitive settings.
- Date, time, number, and percent formatting under all ten initial target UI locales.
- Missing supported-locale resource should fail clearly.
- Missing TTS voice-locale for a selected locale should report a visible audio-unavailable condition while leaving text available.
- Locale resources should not be fetched from a production translation API at runtime.

## Risks And Decisions

Open decisions:

- Which UI i18n library, if any, is worth adding after dependency review.
- Where package/course language metadata should live in current TDF/package schemas.
- Whether content-language metadata is required for all new packages or only recommended at first.
- Which authoring surfaces should expose matching-language controls in the first implementation slice.
- Whether any initial primary TTS code should change before launch, for example `es-US` instead of `es-ES`, `pt-PT` instead of `pt-BR`, `fr-CA` instead of `fr-FR`, or `ur-PK` if provider/browser support changes.

Main risks:

- Accidentally translating authored educational content through platform i18n.
- Treating speech language, TTS language, UI locale, and content language as one concept.
- Accidentally requiring speech recognition support in every target language when the actual invariant is localized UI, text input, and TTS for platform-owned prompts.
- Speaking authored content in the UI locale when the author intended a separate content TTS language.
- Adding fallback behavior that hides broken locale resources.
- Using English-centric answer normalization in multilingual content.
- Underestimating layout expansion, line wrapping, and input method behavior in non-English UI.
- Breaking existing English lessons by making content metadata immediately required before config compatibility has been handled.
- Adding reactive broad TDF publications or full-document payloads to support locale metadata instead of using existing bounded exact-ID/listing paths.

## Implementation Handoff Checklist

The coding team should not begin broad UI conversion until these boxes are satisfied:

- The canonical locale/TTS constants module exists and has tests.
- The translation helper and missing-key behavior are implemented and tested.
- The team has a route/surface inventory with string ownership classification.
- Metadata field names have been searched across `mofacts/`, `learning-components/`, and `C:\dev\mofacts_config`.
- Any new dependency proposal has explicit approval.
- The audio ownership map distinguishes UI locale, platform TTS locale, authored content TTS language, and speech-recognition language.
- The first implementation slice has a verification plan covering typecheck, lint, required schema generation, and route-level UI smoke tests when applicable.

Recommended first implementation slice:

1. Add common locale constants, directionality helper, and primary TTS mapping.
2. Add client locale selection and translation lookup with hard failure for missing required keys.
3. Add English locale resources plus AI-draft skeletons for the other nine target locales.
4. Convert one low-risk learner surface and one practice-control/system-message surface.
5. Add platform-prompt TTS resolver tests before wiring it into runtime playback.
6. Smoke test text display, typing, and TTS for the converted surface.

## Acceptance Criteria

The plan is complete when MoFaCTS has a documented path where:

- UI locale, content language, and learner response language are modeled separately.
- Every platform-owned UI string and system prompt has an AI-generated draft translation for `en`, `zh-Hans`, `hi`, `es`, `ar`, `fr`, `bn`, `pt`, `id`, and `ur`.
- Platform strings can be reviewed and enabled without modifying authored content.
- Authored content declares language metadata without implying automatic translation.
- Learners can see system prompts in each initial target UI locale.
- Learners can type responses in the scripts and input patterns required by English, Mandarin Chinese, Hindi, Spanish, Standard Arabic, French, Bengali, Portuguese, Indonesian, and Urdu.
- Platform-owned system prompts can be spoken in each initial target UI locale through the explicit primary TTS-code mapping.
- Speech recognition remains optional and explicitly configured; lack of speech-recognition support for a target locale does not block UI localization, TTS localization, display, or typed input.
- Learner input can support Unicode, IME, accents, right-to-left input, and script-specific normalization choices.
- Missing locale or metadata invariants fail clearly.
- New TDF/config/schema concepts are introduced only after adjacent-concept search and config compatibility review.
- Any new dependency is justified and explicitly approved before package manifests change.
- Verification gates are attached to each implementation slice.
- The public product language avoids the claim that MoFaCTS translates courses.
