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

- AI creation is a resumable draft workflow: interpret the request, generate items, resolve requested prompt images, review/edit, then save the completed package. Unresolved required images remain as uploadable blank prompt slots; they do not erase the draft.
- The simple AI review shows prompts, responses, and image replacement controls. It does not expose TDF JSON or lesson-delivery settings.
- Direct package upload accepts MoFaCTS `.zip` packages only.
- The Anki wizard reads `.apkg` locally and uploads only the converted MoFaCTS `.zip` package.
- The Canvas/Common Cartridge wizard reads `.imscc` locally and uploads only the converted MoFaCTS `.zip` package.
- Lesson media uploads are separate from package imports and must target a specific TDF and stimulus set.

## Where Detailed Examples Belong

Detailed course examples, content packages, sync workflows, and internal authoring notes belong in the configuration/content repository or the GitHub wiki, not in the public application README.
