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

- AI creation starts with only author notes, optional images, a Learning/Test selector, and Submit. Review contains a required editable title plus the generated stimulus-response pairs.
- The application contract is one ordered pair array whose entries contain `kind`, `stimulus`, and `response`. Text requests and requests that identify author-uploaded images use the pair-generation model. Its strict provider transport uses an object containing only `pairs` because the configured OpenAI endpoint requires an object-root schema; MoFaCTS unwraps it immediately. Text-pair stimuli are learner-visible. An image-pair stimulus is exactly `image: <response>` and is never learner-visible. MoFaCTS supplies fixed instructions, typed-response settings, IDs, lesson structure, defaults, and package contents deterministically.
- Learning uses `Study each item, then type the correct answer.` Test uses `Type the correct answer for each item.`
- Working content is one overwrite-only browser-local IndexedDB record with WebP image bytes. The server authenticates AI calls and accepts the final explicit save, but does not store working records, revisions, or draft media. The local record is cleared after successful Save or explicit Discard.
- For an image-set request without uploads, the pair-generating AI does not enumerate the items. A strict topic request identifies a collection-level Wikipedia starting point. MoFaCTS then deterministically selects the relevant named article section, follows its enumerated collection branches, and uses Wikipedia categories or exact member links to obtain canonical responses. Associated images are procured in the same bounded traversal. A member with no acceptable image remains an image pair with an unresolved slot.
- Uploaded and discovered images are browser-converted to WebP at a maximum width of 1280 and quality 0.86. Automatic discovery performs up to five bounded Wikipedia collection-to-member traversal rounds, accepts only allowed Wikimedia licenses, downloads the selected PNG or other source rendition before conversion, retains full attribution, requires a distinct source file for each pair, and preserves coherent partial coverage. When the requested items are parts of a system or set, discovery requires contextual images that show the larger structure while distinguishing the requested member; isolated images are not accepted. Known labeled or annotated plate families are rejected when printed text could reveal the response. Context ranks before file format: static images break a quality tie, while an animated source is used only when its converted WebP frame still shows the required context and target.
- Missing image pairs remain visible as replaceable image slots and block Save. The creator never changes a requested image pair to text.
- Administrators can use the no-retention AI Content Prompt Lab and Wikimedia Discovery Lab in Admin Tests. The Prompt Lab exposes the complete non-secret OpenRouter request, a strict-schema preflight, and a copyable successfully validated pair array for model experiments. The Discovery Lab takes only author notes because Wikipedia, not the Prompt Lab's generated array, owns automatic image-set enumeration. **Run Discovery** explicitly starts topic planning and exposes the complete topic request, selected Wikipedia sections, collection and member links, queries, traversal rounds and paths, canonical pairs, candidates, family evidence, licenses, acquisition and conversion results, limits, selections, stop reasons, and rejections.
- Direct package upload accepts MoFaCTS `.zip` packages only.
- The Anki wizard reads `.apkg` locally and uploads only the converted MoFaCTS `.zip` package.
- The Canvas/Common Cartridge wizard reads `.imscc` locally and uploads only the converted MoFaCTS `.zip` package.
- Lesson media uploads are separate from package imports and must target a specific TDF and stimulus set.

## Where Detailed Examples Belong

Detailed course examples, content packages, sync workflows, and internal authoring notes belong in the configuration/content repository or the GitHub wiki, not in the public application README.
