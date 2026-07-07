# Interface Internationalization Status

This record tracks the implementation state for `interface-internationalization-plan.md`.

## Locale Status

All ten initial target locales have checked-in AI-draft platform strings. Human review is still required before a locale is considered production-reviewed.

| Locale | Language | Direction | Primary platform TTS code | Platform string status | Production enablement |
| --- | --- | --- | --- | --- | --- |
| `en` | English | LTR | `en-US` | Draft complete | enabled baseline |
| `zh-Hans` | Mandarin Chinese | LTR | `cmn-CN` | AI draft complete | review required |
| `hi` | Hindi | LTR | `hi-IN` | AI draft complete | review required |
| `es` | Spanish | LTR | `es-ES` | AI draft complete | review required |
| `ar` | Standard Arabic | RTL | `ar-XA` | AI draft complete | review required |
| `fr` | French | LTR | `fr-FR` | AI draft complete | review required |
| `bn` | Bengali | LTR | `bn-IN` | AI draft complete | review required |
| `pt` | Portuguese | LTR | `pt-BR` | AI draft complete | review required |
| `id` | Indonesian | LTR | `id-ID` | AI draft complete | review required |
| `ur` | Urdu | RTL | `ur-IN` | AI draft complete | review required |

## Language Ownership Map

| Concept | Current implementation owner | Runtime meaning | Notes |
| --- | --- | --- | --- |
| UI locale | `mofacts/common/lib/interfaceLocales.ts`, `mofacts/common/lib/interfaceLocaleSelection.ts`, `mofacts/client/lib/interfaceLocaleState.ts` | Platform chrome, formatting, document direction, and platform-owned prompt TTS selection. | User profile preference persists as `profile.uiLocale`; Session override is available for local/reactive switching. |
| Platform strings | `mofacts/client/lib/interfaceI18nResources.ts` and `mofacts/client/lib/interfaceI18n.ts` | Versioned MoFaCTS UI strings. | Missing locale/key/interpolation values fail clearly. |
| Content language | TDF `tdfs.tutor.setspec.contentLanguage` | Authored instructional content language. | Used for learner text input `lang`/`dir`; does not translate authored content. |
| Recommended UI locales | TDF `tdfs.tutor.setspec.recommendedUiLocales` | Author/package recommendation for platform chrome. | Metadata only in the current slice. |
| Content translation status | TDF `tdfs.tutor.setspec.translationStatus` | Author-declared review state for a content-language variant. | Does not cause automatic translation. |
| Learner response normalization | `mofacts/common/lib/learnerResponseNormalization.ts` and `mofacts/client/views/experiment/answerAssess.ts` | Unicode normalization, case policy, and accent policy for typed answers. | Accent-sensitive matching is available through answer-assessment options; broader authoring controls are not yet exposed. |
| Speech recognition language | TDF `speechRecognitionLanguage` and speech-recognition services | Provider language code for microphone transcription. | Remains opt-in and separate from UI locale and content language. |
| Authored content TTS language | TDF `textToSpeechLanguage` and authored-content branch in `ttsService.ts` | Spoken authored prompts/feedback when audio is enabled. | Preserves existing lesson-owned TTS behavior. |
| Platform prompt TTS language | `resolvePlatformPromptTtsLanguage` and platform-prompt branch in `ttsService.ts` | Spoken platform-owned prompts in selected UI locale. | Explicit mapping only; unsupported or missing voice conditions report errors instead of substituting English. |

## Implemented Surfaces

- App loading/status chrome uses locale resources for initial loading and readiness messages.
- App shell menu/close labels, practice return control, home sidebar navigation, account menu, compact practice menu, role label, and home guided-tour text use locale resources.
- Profile debug toggle chrome uses locale resources for the debug-menu heading and probability-parameter display control.
- Learner dashboard uses locale resources for resume card metrics, search controls, lesson summary, loading and empty states, section headings, table/card headers, action buttons, details labels, lesson feature tooltips, settings panel status/actions, and dashboard launch/error messages.
- Course listing shell uses locale resources for search/sort controls, loading and empty states, table/card headers, status labels, action labels, due/release prefixes, and time-unit labels.
- Admin Controls uses locale resources for server status/storage labels, stimulus display cache maintenance copy/actions, server logging controls, browser console logging controls, and local admin status/error messages.
- User Admin uses locale resources for page/section headings, list controls, pagination labels, table headers, role/action controls, delete-user confirmation copy, import-user controls, the access-denied message, local action-status messages for API-key administration, API-key provider labels, news-email preparation, usage-cache refresh, role changes, user deletion, and batch user import, plus usage-cache table display strings and API-key metadata placeholder/status strings.
- Audio Settings uses locale resources for TTS/SR headings, toggles, descriptions, volume/speed/voice controls, voice labels, speech-detection threshold guidance, sound-level reference table, Speech API key setup copy, save/delete actions, and local save/delete status messages.
- Admin Backups uses locale resources for page headings, same-server backup warning copy, backup configuration labels, create/history/action buttons, empty state, selected-manifest heading, restore/delete confirmation panel copy, enabled/disabled/not-configured labels, admin-access-required copy, and local backup/create/verify/manifest/download/delete/restore status messages.
- Admin Tests uses locale resources for deployment-readiness headings, description, action button, running/result status messages, readiness table headers, and pass/fail status labels.
- Content Manager uses locale resources for the page title, quota banner, uploaded-content table headers, public/private visibility switch labels, pending upload badges/progress/error-label text in the table, stimulus/media manager controls, media file table headers/tooltips, access/ownership controls and local status messages, condition selector labels, package action tooltips, upload-package heading, Anki/Canvas import section headings/descriptions/actions, copy/delete/download/media-upload confirmations and status messages, package upload/overwrite/processing confirmations and status messages, and delete-all admin warning/action.
- Course Management uses locale resources for course-edit headings, loading/empty states, course visibility/date/timezone/section controls, timezone labels, save/delete actions, and local validation/save/delete confirmation and status messages.
- Course/class selection uses locale resources for join-course headings, enrollment/current-course status, instructor/course selectors, save/back actions, loading text, and local validation/save status messages.
- Course Assignments uses locale resources for assignment-editor headings, course selector, lesson search, selected-assignment status, loading/empty states, order/action tooltips, required/release/due controls, reset/save actions, and local assignment validation messages.
- AI Content Creator uses locale resources for authoring chrome, OpenRouter setup warning/action, source input prompt and accessibility label, character count, mode selector labels/helper text, manual-create action, create button states, local validation/status messages, AutoTutor creation progress, and generated-name conflict prompt.
- TDF Editor uses locale resources for edit-page headings, condition context, loading/not-found states, unsaved-change badge, description verbosity controls, cancel/save actions, schema/custom-validation messages, save feedback, schema-load errors, and editor-library load errors.
- Content/Stimulus Editor uses locale resources for edit-page headings, stimulus-file context, loading/not-found/initializing states, shared editor chrome, incorrect-response generation/removal controls and confirmations, cluster navigation/window labels, schema/custom-validation messages, save feedback, schema/editor-load errors, and media preview/upload feedback.
- SPARC authoring route/header/palette chrome uses locale resources for loading/not-found route states, content-manager return action, visual-editor title, advanced-editor toggle, cancel/save actions, saving state, target-page label, advanced tab labels, editor tablist accessibility label, palette heading, and palette accessibility label.
- SPARC rich-text toolbar and reusable rule-expression editor use locale resources for toolbar accessibility/group labels, node-hierarchy toggle, formatting/list/alignment/link/media/table/history controls, reusable expression field labels, argument headings, add-argument action, and remove action.
- SPARC advanced production-rule editor uses locale resources for panel headings, add/move/delete controls, rule summaries, empty states, common field labels, condition/test/effect section labels, slot ARIA labels, expression labels, target/node/state labels, and production-rule guidance while preserving rule IDs, type values, cluster labels, JSON, and authored effect/template text as data.
- SPARC scoped/selected-node side panels use locale resources for scoped-rule template controls, add-rule-for-selection action, scoped-rule empty states and JSON labels, selected-node actions and media-editing labels, local-host embed warning, dropdown/button/panel-selector field labels, cluster-attachment heading, and generated cluster-checkbox ARIA labels while preserving node IDs, rule IDs, enum values, cluster labels, HTML, JSON, and authored node content as data.
- SPARC visual surface and rich-text runtime messages use locale resources for drop-surface and node-hierarchy accessibility labels, drag/drop placement status, rich-text placeholder, HTTPS URL validation errors, selected-node delete confirmation, no-active-display error, and saved status.
- Manual Content Creator shell/lifecycle uses locale resources for route header, draft save/update/delete actions, wizard step labels/headings, top-level navigation buttons, draft-load/save/delete messages, delete-draft confirmation, status summary, package-ready/uploaded states, final package action buttons, upload/overwrite confirmations and progress/status messages.
- Manual Content Creator embedded draft workspace uses locale resources for editor headings, save/continue label, lesson selector label, lesson-count labels, TDF/content tabs, reset/back actions, manifest card/media/skipped summary terms, and draft-editor validation/init error messages.
- Manual Content Creator dynamic content-draft editor uses locale resources for JSONEditor edit-properties/JSON button chrome, cluster-window navigation controls, cluster range status, window-size label, performance helper text, no-cluster empty state, and editor-control initialization failure.
- Manual Content Creator summary/finalization copy uses locale resources for step intro descriptions, finalize/package status copy, included-lessons label, summary labels, summary option values for structure/prompt/response/top-bar, visibility summary value, and pending/off link summary states.
- Manual Content Creator form option values use locale resources for structure modes, visibility radio labels, prompt/response types, button-order choices, text-to-speech modes, and top-bar modes.
- Manual Content Creator starter-content section uses locale resources for starting-mode label/options, starter-mode helper text, paste-table label/placeholder/expected-column text, row-count summary, add-row action, answer/choice/action table headers, and associated draft strings.
- Manual Content Creator basics/card/audio field copy uses locale resources for lesson-name, instruction, visibility, experiment-link, prompt/response/card/shuffle/button-order, speech-recognition, text-to-speech, top-bar, timing, and tag labels/helpers/placeholders; the `en-US` speech-language placeholder remains a literal provider code example.
- Manual Content Creator visible platform copy is localized for the wizard shell, save/delete lifecycle, mode controls, summary/finalization panels, embedded draft workspace, starter-content table, and basics/card/audio/display field controls. Authored lesson fields remain author-entered content.
- Anki import wizard upload-step chrome uses locale resources for the wizard title/description, stepper labels, inline cancel action, select-deck heading, file-picker label/help text, analysis progress labels, upload-step error heading, cancel button, and analyze-deck action.
- Anki import wizard setup step uses locale resources for deck metadata labels, importable-note count, available-fields labels, field type labels, samples/no-samples labels, TDF configuration headings/actions, field selectors, note-range labels/help, selected-note summaries, configuration-valid status, add-configuration help, setup summary lines, back/open-draft actions, packaging-error heading, and remove-config confirmations.
- Anki import wizard package/upload step uses locale resources for package-generation headings/status, generated-file summaries, skipped-card warnings, download/upload actions, upload progress hints, overwrite confirmations, package-processing errors, close-wizard confirmation, and setup validation errors.
- Canvas IMSCC import wizard uses locale resources for upload/analyze chrome, setup output-mode controls, metadata/table labels, quiz selection summaries, joined/separate conversion settings, validation messages, draft-preparation status, package-generation headings/status, generated-file summaries, manifest count labels, download/upload actions, upload progress hints, package-processing errors, and close-wizard action.
- Reporting/Data Download uses locale resources for data-download headings, download actions, table headers, loading/empty states, link tooltips, condition-count display, instructor-reporting headings, class/module selectors, deadline filters, performance table headers, due-date grouping rows, exception actions, totals/empty rows, and local download/exception status messages.
- Theme Settings editor library chrome uses locale resources for the page title, inline confirmation cancel button, theme-library heading, active-server-theme label, active/export/reset/import actions, library empty state, theme-name label, active/activate state labels, system/custom origin labels, and delete-theme confirmation copy.
- Theme Generation Wizard uses locale resources for generator headings, palette controls, polarity/density/contrast controls, palette expansion options, palette statistics, generated-theme preview labels, diagnostics headings, action buttons, default generated names, default palette-slot labels, and local palette/theme validation and status messages.
- Login, signup, password-reset, and email-verification templates use locale resources for static platform-owned account text, email-verification lifecycle status messages, resend-verification validation/status messages, and verification error fallbacks while preserving server-provided error reasons when supplied.
- Help page platform chrome uses locale resources for the student-help heading, administrator-contact prompt, and help-content load-failure message while preserving custom or wiki Markdown help content as authored documentation.
- Profile page exposes an interface-language selector backed by `profile.uiLocale`, and profile chrome uses locale resources for private/public profile labels, avatar controls, AI-provider controls, save/test/delete actions, and local avatar/profile status messages.
- Standard flashcard learner text input receives `lang` and `dir` from declared `contentLanguage`.
- Learner performance stat bars use locale resources for session-stats accessibility labels, time/minute/correct labels, and Svelte timeout-countdown messages.
- Learner runtime fallback controls use locale resources for platform-owned Continue labels, video loading/autoplay-blocked messages, H5P iframe accessibility title, and invalid H5P display fallback text while preserving authored `continueButtonText` when provided by lesson settings.

## Current Verification

- `npm run generate:schemas` from `mofacts/` passed after adding TDF language metadata fields.
- `npm run typecheck` from `mofacts/` passed after the Content Manager package-upload/overwrite/processing localization slice.
- `npm run lint` from `mofacts/` passed after the Content Manager package-upload/overwrite/processing localization slice.
- `npm run typecheck` from `mofacts/` passed after the User Admin template-chrome localization slice.
- `npm run lint` from `mofacts/` passed after the User Admin template-chrome localization slice.
- `npm run typecheck` from `mofacts/` passed after the User Admin action-status localization slice.
- `npm run lint` from `mofacts/` passed after the User Admin action-status localization slice.
- `npm run typecheck` from `mofacts/` passed after the User Admin usage-cache/API-key metadata display localization slice.
- `npm run lint` from `mofacts/` passed after the User Admin usage-cache/API-key metadata display localization slice.
- `npm run typecheck` from `mofacts/` passed after the Audio Settings localization slice.
- `npm run lint` from `mofacts/` passed after the Audio Settings localization slice.
- `npm run typecheck` from `mofacts/` passed after the Admin Backups template-chrome localization slice.
- `npm run lint` from `mofacts/` passed after the Admin Backups template-chrome localization slice.
- `npm run typecheck` from `mofacts/` passed after the Admin Backups operation-message localization slice.
- `npm run lint` from `mofacts/` passed after the Admin Backups operation-message localization slice.
- `npm run typecheck` from `mofacts/` passed after the Reporting/Data Download localization slice.
- `npm run lint` from `mofacts/` passed after the Reporting/Data Download localization slice.
- `npm run typecheck` from `mofacts/` passed after the Admin Tests localization slice.
- `npm run lint` from `mofacts/` passed after the Admin Tests localization slice.
- `npm run typecheck` from `mofacts/` passed after the learner runtime fallback-control localization slice.
- `npm run lint` from `mofacts/` passed after the learner runtime fallback-control localization slice.
- `npm run typecheck` from `mofacts/` passed after the Theme Generation Wizard localization slice.
- `npm run lint` from `mofacts/` passed after the Theme Generation Wizard localization slice.
- `npm run typecheck` from `mofacts/` passed after the Course Management localization slice.
- `npm run lint` from `mofacts/` passed after the Course Management localization slice.
- `npm run typecheck` from `mofacts/` passed after the Course Assignments localization slice.
- `npm run lint` from `mofacts/` passed after the Course Assignments localization slice.
- `npm run typecheck` from `mofacts/` passed after the AI Content Creator localization slice.
- `npm run lint` from `mofacts/` passed after the AI Content Creator localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator shell/lifecycle localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator shell/lifecycle localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator embedded draft-workspace localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator embedded draft-workspace localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator summary/finalization localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator summary/finalization localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator form-option localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator form-option localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator starter-content localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator starter-content localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator basics/card/audio field-copy localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator basics/card/audio field-copy localization slice.
- `npm run typecheck` from `mofacts/` passed after the Anki import wizard upload-step localization slice.
- `npm run lint` from `mofacts/` passed after the Anki import wizard upload-step localization slice.
- `npm run typecheck` from `mofacts/` passed after the Anki import wizard setup-step localization slice.
- `npm run lint` from `mofacts/` passed after the Anki import wizard setup-step localization slice.
- `npm run typecheck` from `mofacts/` passed after the Anki import wizard package/upload-step and validation-error localization slice.
- `npm run lint` from `mofacts/` passed after the Anki import wizard package/upload-step and validation-error localization slice.
- `npm run typecheck` from `mofacts/` passed after the TDF Editor localization slice.
- `npm run lint` from `mofacts/` passed after the TDF Editor localization slice.
- `npm run typecheck` from `mofacts/` passed after the Content/Stimulus Editor localization slice.
- `npm run lint` from `mofacts/` passed after the Content/Stimulus Editor localization slice.
- `npm run typecheck` from `mofacts/` passed after the Canvas IMSCC import wizard upload/analyze-step localization slice.
- `npm run lint` from `mofacts/` passed after the Canvas IMSCC import wizard upload/analyze-step localization slice.
- `npm run typecheck` from `mofacts/` passed after the Canvas IMSCC import wizard setup/package/upload localization slice.
- `npm run lint` from `mofacts/` passed after the Canvas IMSCC import wizard setup/package/upload localization slice.
- `npm run typecheck` from `mofacts/` passed after the SPARC authoring header/palette localization slice.
- `npm run lint` from `mofacts/` passed after the SPARC authoring header/palette localization slice.
- `npm run typecheck` from `mofacts/` passed after the SPARC authoring route-wrapper localization slice.
- `npm run lint` from `mofacts/` passed after the SPARC authoring route-wrapper localization slice.
- `npm run typecheck` from `mofacts/` passed after the SPARC rich-text toolbar and reusable expression-editor localization slice.
- `npm run lint` from `mofacts/` passed after the SPARC rich-text toolbar and reusable expression-editor localization slice.
- `npm run typecheck` from `mofacts/` passed after the SPARC advanced production-rule editor localization slice.
- `npm run lint` from `mofacts/` passed after the SPARC advanced production-rule editor localization slice.
- `npm run typecheck` from `mofacts/` passed after the SPARC scoped/selected-node side-panel localization slice.
- `npm run lint` from `mofacts/` passed after the SPARC scoped/selected-node side-panel localization slice.
- `npm run typecheck` from `mofacts/` passed after the SPARC visual-surface and rich-text runtime-message localization slice.
- `npm run lint` from `mofacts/` passed after the SPARC visual-surface and rich-text runtime-message localization slice.
- `npm run typecheck` from `mofacts/` passed after the Manual Content Creator dynamic content-draft editor localization slice.
- `npm run lint` from `mofacts/` passed after the Manual Content Creator dynamic content-draft editor localization slice.
- `npm run typecheck` from `mofacts/` passed after the email-verification account-flow localization slice.
- `npm run lint` from `mofacts/` passed after the email-verification account-flow localization slice.
- `npm run typecheck` from `mofacts/` passed after the course/class selection localization slice.
- `npm run lint` from `mofacts/` passed after the course/class selection localization slice.
- `npm run typecheck` from `mofacts/` passed after the profile debug-toggle localization slice.
- `npm run lint` from `mofacts/` passed after the profile debug-toggle localization slice.
- `npm run typecheck` from `mofacts/` passed after the Theme Settings library-chrome localization slice.
- `npm run lint` from `mofacts/` passed after the Theme Settings library-chrome localization slice.
- `npm run typecheck` from `mofacts/` passed after the learner performance-stat localization slice.
- `npm run lint` from `mofacts/` passed after the learner performance-stat localization slice.
- `npm run typecheck` from `mofacts/` passed after the Help page platform-chrome localization slice.
- `npm run lint` from `mofacts/` passed after the Help page platform-chrome localization slice.
- `npm run typecheck` from `mofacts/` passed after the User Admin API-key provider-label localization slice.
- `npm run lint` from `mofacts/` passed after the User Admin API-key provider-label localization slice.
- `npm run typecheck` from `mofacts/` passed after the Content Upload error-label localization slice.
- `npm run lint` from `mofacts/` passed after the Content Upload error-label localization slice.
- Hotfix app smoke through the MoFaCTS Playwright sidecar: `/home` redirected to `/auth/login` because the sidecar browser was not signed in; the accessible login route loaded with no console errors.
- Runtime locale smoke through the sidecar: setting `Session.uiLocale` to `ar` and `ur` changed the document to RTL target locale tags and rendered localized platform strings on the login route.
- `/auth/verify-email` sidecar smoke after the email-verification account-flow localization slice loaded directly with no console warnings or errors.
- `/auth/verify-email` sidecar locale smoke after setting `Session.uiLocale` to `ar` produced `lang=\"ar\"`, `dir=\"rtl\"`, and rendered Arabic title/button text.
- `/help` sidecar smoke after the Help page platform-chrome localization slice loaded directly with no console warnings or errors, rendered the `Student Help Guide` heading, and loaded non-empty help Markdown content.
- `/help` sidecar locale smoke after setting `Session.uiLocale` to `ar` produced `lang=\"ar\"`, `dir=\"rtl\"`, and rendered the Arabic help heading.
- `/courses` sidecar smoke redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated course-listing rendering still needs smoke evidence.
- `/home` sidecar smoke redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated learner-dashboard rendering still needs smoke evidence.
- `/home` sidecar smoke after the profile debug-toggle localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated debug-toggle rendering still needs smoke evidence.
- `/home` sidecar smoke after the learner performance-stat localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated lesson-runtime performance rendering still needs smoke evidence.
- `/profile` sidecar smoke redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated profile rendering and save behavior still need smoke evidence.
- `/adminControls` sidecar smoke redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated admin rendering still needs smoke evidence.
- `/userAdmin` sidecar smoke after the User Admin usage-cache/API-key metadata display localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated user-admin rendering and actions still need smoke evidence.
- `/userAdmin` sidecar smoke after the User Admin API-key provider-label localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated user-admin rendering and actions still need smoke evidence.
- `/audioSettings` sidecar smoke after the Audio Settings localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated audio settings rendering and control behavior still need smoke evidence.
- `/adminBackups` sidecar smoke after the Admin Backups operation-message localization slice loaded `/adminBackups` with title `MoFaCTS` and no console errors, but the unauthenticated sidecar page body was empty; authenticated admin-backups rendering and operation behavior still need smoke evidence.
- `/contentUpload` sidecar smoke after the Content Manager package-upload/overwrite/processing localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated Content Manager rendering and upload/import workflows still need smoke evidence.
- `/contentUpload` sidecar smoke after the Content Upload error-label localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Content Manager rendering and upload/import workflows still need smoke evidence.
- `/contentUpload` sidecar smoke after the Anki import wizard upload-step localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated Anki import wizard rendering and workflow behavior still need smoke evidence.
- `/contentUpload` sidecar smoke after the Anki import wizard package/upload-step and validation-error localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Anki import wizard rendering and workflow behavior still need smoke evidence.
- `/dataDownload` sidecar smoke after the Reporting/Data Download localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated data-download rendering and download behavior still need smoke evidence.
- `/instructorReporting` sidecar smoke after the Reporting/Data Download localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated instructor-reporting rendering and exception-action behavior still need smoke evidence.
- `/admin/tests` sidecar smoke after the Admin Tests localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated admin-tests rendering and readiness-run behavior still need smoke evidence.
- `/theme` sidecar smoke after the Theme Generation Wizard localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated theme generation wizard rendering and create/preview behavior still need smoke evidence.
- `/theme` sidecar smoke after the Theme Settings library-chrome localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Theme Settings editor rendering and library actions still need smoke evidence.
- `/classEdit` sidecar smoke after the Course Management localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated course-management rendering and save/delete behavior still need smoke evidence.
- `/classSelection` sidecar smoke after the course/class selection localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated class-selection rendering and save behavior still need smoke evidence.
- `/tdfAssignmentEdit` sidecar smoke after the Course Assignments localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated course-assignment rendering and save behavior still need smoke evidence.
- `/aiContentCreate` sidecar smoke after the AI Content Creator localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated AI Content Creator rendering and creation behavior still need smoke evidence.
- `/contentCreate` sidecar smoke after the Manual Content Creator summary/finalization localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console errors; authenticated Manual Content Creator rendering, draft editing, and upload behavior still need smoke evidence.
- `/contentCreate` sidecar smoke after the Manual Content Creator dynamic content-draft editor localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Manual Content Creator draft editing still needs smoke evidence.
- `/tdfEdit/placeholder-smoke` sidecar smoke after the TDF Editor localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated TDF Editor rendering and save behavior still need smoke evidence.
- `/contentEdit/placeholder-smoke` sidecar smoke after the Content/Stimulus Editor localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Content/Stimulus Editor rendering and save behavior still need smoke evidence.
- `/contentUpload` sidecar smoke after the Canvas IMSCC import wizard upload/analyze-step localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Canvas IMSCC import wizard rendering and workflow behavior still need smoke evidence.
- `/contentUpload` sidecar smoke after the Canvas IMSCC import wizard setup/package/upload localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated Canvas IMSCC import wizard rendering and workflow behavior still need smoke evidence.
- `/sparcEdit/placeholder-smoke` sidecar smoke after the SPARC authoring route/header/palette localization slices redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated SPARC authoring rendering and save behavior still need smoke evidence.
- `/sparcEdit/placeholder-smoke` sidecar smoke after the SPARC rich-text toolbar and reusable expression-editor localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated SPARC authoring rendering and save behavior still need smoke evidence.
- `/sparcEdit/placeholder-smoke` sidecar smoke after the SPARC advanced production-rule editor localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated SPARC authoring rendering and save behavior still need smoke evidence.
- `/sparcEdit/placeholder-smoke` sidecar smoke after the SPARC scoped/selected-node side-panel localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated SPARC authoring rendering and save behavior still need smoke evidence.
- `/sparcEdit/placeholder-smoke` sidecar smoke after the SPARC visual-surface and rich-text runtime-message localization slice redirected to `/auth/login` in the unauthenticated browser and produced no console warnings or errors; authenticated SPARC authoring rendering and save behavior still need smoke evidence.

## Remaining Surfaces

- Authenticated learner dashboard rendering smoke, authenticated course listing rendering smoke, authenticated profile rendering/save smoke, authenticated admin controls smoke, authenticated User Admin rendering/action smoke, authenticated Audio Settings rendering/control smoke, authenticated Admin Backups rendering/operation smoke, authenticated Content Manager rendering/upload smoke, authenticated Reporting/Data Download rendering/action smoke, authenticated Admin Tests rendering/readiness-run smoke, authenticated Theme Generation Wizard preview/create smoke, authenticated Course Management rendering/save/delete smoke, authenticated Course Assignments rendering/save smoke, authenticated AI Content Creator rendering/creation smoke, authenticated Manual Content Creator rendering/draft/upload smoke, authenticated SPARC authoring rendering/save smoke, lesson-specific learner runtime fallback-control smoke for video/H5P/display-timeout scenarios, remaining authoring/admin pages, remaining analytics pages, and remaining profile-adjacent dynamic server messages.
- Human review workflow and reviewer signoff for non-English AI-draft strings.
- Authoring UI controls for matching policy beyond the runtime answer-assessment option.
- Route-level smoke evidence for all ten target locales and mixed-language lesson scenarios.
- Platform-prompt TTS smoke evidence for all ten primary TTS codes.
