# Authoring Overview

MoFaCTS uses Tutor Definition Files (TDFs) to define adaptive learning content.

## What A TDF Describes

A TDF can define:

- lesson metadata,
- units and practice items,
- stimulus content,
- response type and answer data,
- feedback behavior,
- scheduling and model parameters,
- media references,
- learner-facing display settings.

## Language Metadata

TDF lesson metadata may declare:

- `contentLanguage`: the BCP 47 language tag for authored instructional content.
- `recommendedUiLocales`: optional BCP 47 UI locale tags recommended for platform chrome.
- `translationStatus`: author-declared review status for the authored content language variant.

These fields describe author-provided content. They do not ask MoFaCTS to translate prompts, answers, hints, feedback, rubrics, or KC labels.

## Supported Practice Patterns

MoFaCTS supports multiple stimulus and response formats, including:

- text prompts,
- cloze and fill-in-the-blank prompts,
- image, audio, and video stimuli,
- multiple-choice responses,
- typed responses,
- speech-recognition-based responses.

## Authoring Guidance

- Keep item wording clear and concise.
- Prefer explicit metadata over implicit naming conventions.
- Verify media paths and file names before upload.
- Test TDFs in a staging or local environment before learner use.
- Do not include private learner data, credentials, or institutional secrets in content packages.

## Creation And Import Paths

- AI creation starts with author notes, a Learning/Test selector, and Submit. One run uses either text prompts or image prompts; correct responses are always text. Review contains a required editable title and one row for every retrieved, generated, or author-supplied item.
- AI first chooses one content strategy. Pasted tables are formatted directly; requested text-to-text tables may be generated in one strict call; images, explicit sources, and externally grounded canonical lists use Wikipedia. A table run is limited to 250 rows, never falls through to Wikipedia, and is rejected as a whole when its required count, columns, or rows are invalid. Wikipedia search returns at most three real page candidates, and AI may select only one supplied opaque candidate ID. Definition and image runs select one structural table, list, or gallery on that page; source-field-mapping runs consider only table regions exposing at least two fields. On the Wikipedia path AI never supplies an item, page, link, URL, or Wikimedia filename. After one individually validated image agrees with a response-bearing canonical filename found on another authoritative item page, MoFaCTS may predict later `File:` titles and use only those that Wikimedia resolves canonically. Text-pair stimuli are learner-visible. An image-pair stimulus is exactly `image: <response>` and is never learner-visible. MoFaCTS supplies IDs, typed-response settings, lesson structure, defaults, and package contents deterministically.
- Learning uses `Study each item, then type the correct answer.` Test uses `Type the correct answer for each item.`
- Working content is one overwrite-only browser-local IndexedDB record with WebP image bytes. The server authenticates AI calls and accepts the final explicit save, but does not store working records, revisions, or draft media. The local record is cleared after successful Save or explicit Discard.
- Text runs support four strategies. Definition runs make one strict definition request per source entry. Source-field-mapping runs select two retrieved table fields once and map their exact row values deterministically. Generated-table runs construct up to 250 rows in one strict call and display a nonblocking external-verification notice. Provided-table runs accept pasted Markdown, CSV, TSV, or aligned text, require unambiguous prompt and response columns, permit light cleanup, and display a reformatting notice. Duplicate prompts, blank fields, and incorrect exact counts reject a generated or supplied table as a whole; no repair or source fallback is attempted.
- Image runs resolve entries individually until one image succeeds. For each later item, canonical response-bearing filenames are compared with the earlier validated images immediately after hydration and before that item's semantic image evaluation. A mismatching item does not disable later attempts. Once one rule is adopted, the current and later `File:` titles are predicted in one deterministic pass and resolved through Wikimedia without another AI evaluation. Missing or technically invalid predictions, plus any entry that failed while collecting seeds, are queued and processed individually once after that pass. Every path still enforces canonical file identity, allowed license, complete attribution, MIME type, dimensions, source-size, download, and WebP conversion. If no observed filename ever agrees, the ordinary per-entry direct-list/detail-page flow handles the entire run.
- Located and manually replaced images are browser-converted to WebP at a maximum width of 1280 and quality 0.86. Initial uploads no longer create or define pairs; file selection and drag/drop are review-time replacements only.
- Missing text prompts and images remain visible with explicit reasons and block Save until manually completed. One item failure does not erase the authoritative list or successful items, and an image item is never silently changed into a text item.
- Administrators use one **AI Content Prompt Lab** in Admin Tests. Its proven Admin capability lookup and explicit stage caller remain fixed while the Creator runs the same full orchestrator and request semantics through its own scoped adapter. The Lab exposes editable author notes plus all nine stage system instructions, user instructions, reasoning, output budget, and strict schema, including the single table generation/formatting stage. **Reset to code defaults** first checkpoints the current draft, then restores every stage setting from the Creator defaults while preserving author notes and saved checkpoints. Its trace shows effective non-secret model requests, generated-table scope and counts, Wikipedia/Wikimedia URLs and candidate objects, direct/detail branches, decisions, acquisition and conversion results, unresolved reasons, and the final Creator-style review. Retrieved page HTML is represented by metadata rather than embedded repeatedly; the complete run object is rendered only when an administrator requests a snapshot, so a growing run remains scrollable. A stage can be retried from its recorded input while validated upstream AI outputs are reused and downstream objects are rebuilt. Drafts and up to 30 named checkpoints remain in the current browser; provider results are not retained on the server. The Creator derives a concise, space-preserving lesson title from the structured subject and actual item count, keeps its own authoring/review/save interface, and reports the current shared pipeline stage and item in its green running-status region. Package filenames remain independently sanitized.
- The SPARC compound-interest live evaluation in Admin Tests requires a compatible uploaded SPARC page. The selected page supplies the problem statement, expectations, misconceptions, KC graph facts, production rules, thresholds, and instructional-controller settings recorded in the evaluation log; the fixed learner transcript and robustness checks remain the compound-interest test scenario.
- Direct package upload accepts MoFaCTS `.zip` packages only.
- MoFaCTS assigns TDF identity automatically. An ID-less package creates new content even when TDF filenames collide; current-package downloads include server-managed `tdfId` values so a later reupload can confirm and update the exact same TDFs. Authors do not enter or edit these IDs.
- Condition experiments are package-owned families. A condition root contains ordered, unique `condition` and `conditionTdfIds` arrays and omits `tutor.unit`; each condition child is an ordinary runnable TDF with at least one unit. The JSON editor does not edit either relationship array. Reupload a complete downloaded package to add or reorder conditions; established condition members cannot be removed individually.
- Package updates use one expiring server preflight plan and one inline confirmation. A stale, changed, expired, or cross-account plan is rejected before content writes. If an older condition root is marked repair-required, it remains unavailable until the server migration or an administrator's dry-run-first repair resolves its exact child IDs.
- The Anki wizard reads `.apkg` locally and uploads only the converted MoFaCTS `.zip` package.
- The Canvas/Common Cartridge wizard reads `.imscc` locally and uploads only the converted MoFaCTS `.zip` package.
- Lesson media uploads are separate from package imports and must target a specific TDF and stimulus set.

## Where Detailed Examples Belong

Detailed course examples, content packages, sync workflows, and internal authoring notes belong in the configuration/content repository or the GitHub wiki, not in the public application README.
