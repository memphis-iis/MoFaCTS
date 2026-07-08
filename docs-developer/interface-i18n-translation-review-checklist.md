# Interface I18n Translation Review Checklist

This checklist governs review of MoFaCTS platform-owned UI strings for the ten initial target locales. It does not approve, translate, or review authored instructional content.

## Scope

Review only platform-owned strings stored in `mofacts/client/lib/interfaceI18nResources.ts`, including navigation, account flows, authoring controls, learner controls, status messages, validation copy, accessibility labels, and platform-owned system prompts.

Do not review authored lesson prompts, answers, hints, explanations, distractors, rubrics, KC labels, SPARC authored node text, AutoTutor authored expectations, or imported content as part of interface localization.

## Locale Status Gates

Each locale has one of these implementation statuses:

- `draft`: AI-generated or maintainer-provided draft strings exist, but qualified human review is incomplete.
- `reviewed`: a qualified reviewer has completed this checklist and approved the strings for staging or pilot use.
- `enabled`: product/release owners have approved the reviewed locale for production selection.
- `deprecated`: the locale remains in history but should not be offered for new use.

English is the enabled baseline. Non-English target locales must remain `draft` until review evidence is complete.

## Required Reviewer Evidence

For each reviewed locale, record:

- Locale tag and language name.
- Reviewer name or review group.
- Reviewer qualification, such as native fluency, professional translation experience, or domain-specific bilingual review.
- Review date.
- Source commit or branch reviewed.
- Whether the reviewer checked desktop and mobile layout.
- Whether the reviewer checked right-to-left layout for `ar` or `ur`.
- Whether accessibility labels and screen-reader text were reviewed.
- Whether audio/TTS terminology was reviewed against the primary TTS code for the locale.
- Any approved terminology choices or intentionally untranslated product terms.
- Any unresolved issues blocking `reviewed` or `enabled` status.

## String Review Checks

For each locale, verify:

- Every required platform string has a non-empty value.
- Strings are understandable without relying on English.
- Product terms intentionally preserved in English are listed in reviewer notes.
- UI control labels are short enough for buttons, tabs, sidebars, table headers, and compact cards.
- Error, warning, success, loading, and empty-state messages are clear and actionable.
- Accessibility labels describe the control or status, not just the visible text.
- Authoring labels do not imply MoFaCTS automatically translates instructional content.
- Content-language metadata labels distinguish authored content language from UI locale.
- Speech-recognition copy does not imply SR support for every UI locale.
- TTS copy distinguishes platform-owned prompt speech from authored-content TTS.
- Date, time, number, and percent phrasing matches locale expectations where strings include units or examples.
- Examples embedded in platform strings remain valid examples rather than translated course content.

## Layout And Runtime Checks

Before marking a locale `reviewed`, smoke at least:

- Login/account flow.
- Learner dashboard and course listing.
- Practice runtime controls and feedback.
- Manual Content Creator basics, language metadata, answer matching, and audio/display controls.
- Content Manager shell.
- Audio Settings.
- Profile interface-language selector.
- One admin/reporting surface.

For `ar` and `ur`, confirm `html dir="rtl"` and inspect at least login, profile, learner dashboard, and Manual Content Creator for obvious layout breakage.

## Signoff Record Template

Copy this template into the status record, release evidence, or wiki page used for the review cycle:

```text
Locale:
Language:
Reviewer:
Reviewer qualification:
Review date:
Commit or branch:
Status requested: reviewed | enabled
Desktop layout checked: yes/no
Mobile layout checked: yes/no
RTL layout checked, if applicable: yes/no/not applicable
Accessibility labels checked: yes/no
Audio/TTS terminology checked: yes/no
Intentional product terms left untranslated:
Known issues:
Decision:
Approver:
```

## Production Enablement Rule

A locale may not move to `enabled` in `mofacts/common/lib/interfaceLocales.ts` unless:

1. The locale has complete checked-in resources.
2. The review evidence above is recorded.
3. Blocking issues are resolved or explicitly accepted by the product/release owner.
4. Route-level smoke evidence exists for the enabled locale.
5. The change runs `npm run typecheck` and `npm run lint` from `mofacts/`.
