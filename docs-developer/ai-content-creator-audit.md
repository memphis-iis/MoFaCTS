# AI Content Creator list-source architecture

**Status:** v4 list-source pipeline implemented on 2026-08-15.

## Owning rule

One retrieved Wikipedia list page defines the complete item set for every run. The model may interpret the author request and select opaque candidate IDs supplied by MoFaCTS, but it may not originate an item, page, link, URL, Wikimedia filename, license, or attribution record. After one individually evaluated and acquired image agrees with a response-bearing canonical filename found on another authoritative item page, MoFaCTS may predict later `File:` titles deterministically and accept only titles that Wikimedia resolves to canonical file records.

A run has one universal prompt type, `text` or `image`; responses are always text. Every source entry reaches review, including entries whose definition or image remains unresolved.

## Data flow

```text
author notes
  -> strict request interpretation
  -> Wikipedia search (at most three real pages)
  -> strict selection of one supplied page candidate ID
  -> retrieve page by page ID
  -> parse/select one table, list, or gallery
  -> source-anchored entries
       -> text: one strict definition call per entry
       -> image: hydrate files contained in the entry
            -> canonical filename agrees with a validated image -> pattern pass
            -> otherwise evaluate direct files
            -> acceptable direct file -> acquire and convert
            -> no acceptable direct file
                 -> hydrate/select canonical entry link
                 -> retrieve detail page
                 -> hydrate its files
                 -> canonical filename agrees with a validated image -> pattern pass
                 -> otherwise evaluate its files
                 -> acquire and convert or remain unresolved
            -> pattern pass
                 -> infer one exact prefix + response + suffix rule
                 -> batch-resolve predicted File: titles through Wikimedia
                 -> validate and acquire canonical matches without an AI call
                 -> individually resolve queued exceptions after the batch
  -> review every authoritative entry
  -> explicit final package save
```

AI selection validators reject extra fields, invented IDs, duplicate rankings, and a selected image that is not first in the returned ranking. Text-definition validation rejects answer-revealing response terms and source aliases.

Image evaluation is based on retrieved filenames, captions, alt text, surrounding text, metadata, and structural roles. It does not inspect pixels or perform cross-item family selection. Technical acquisition validates a canonical file-page ID, supported image type, dimensions, allowed machine-readable license, complete attribution, nonempty image response, source-size bound, and WebP conversion result.

After the first successful individual image, the filename-pattern path inspects response-bearing canonical filenames as each later item is hydrated. It compares those observed filenames with all earlier individually validated images before invoking that item's semantic image evaluator. The agreeing pair must come from the same direct/detail branch and expose the same normalized prefix, suffix, and extension with the displayed response occurring exactly once. A disagreement does not disable later inference; the pipeline continues in list order and tries again as soon as another item's canonical filenames are available. At most one pattern is adopted. Successful canonical matches skip semantic AI evaluation but never skip metadata, licensing, attribution, download, or conversion checks. Missing or technically invalid pattern matches and entries that remained unresolved while collecting seeds are queued before the ordinary individual resolver makes one post-pattern attempt for those exceptions.

## Code ownership

- `common/aiContentContract.ts`: v4 working/save data, provenance, stage traces, and save validators.
- `client/lib/aiContentPrompts.ts`: editable bounded prompts, strict schemas, and semantic response validators.
- `client/lib/aiContentWikipediaSource.ts`: Wikipedia request URLs, page retrieval, structural regions, entries, file references, and canonical detail links.
- `client/lib/aiContentWikimediaFiles.ts`: canonical file hydration, license/attribution checks, downloads, and conversion.
- `client/lib/aiContentImageFilenamePattern.ts`: pure two-filename pattern inference and deterministic predicted-title construction.
- `client/lib/aiContentPipeline.ts`: the single production/Lab orchestrator, revision guards, seeding, pattern resolution, queued exception routing, traces, resolutions, and final pairs.
- `client/lib/aiContentOpenRouterClient.ts`: explicit model, reasoning, schema, output budget, and no-fallback provider transport.
- `client/views/experimentSetup/aiContentCreator.ts`: author input, progress, review edits, review-time image replacement, persistence, and save.
- `client/views/aiContentPromptLab.ts`: editable stage settings, local checkpoints, complete runs, recorded-stage retry, trace rendering, and review preview.
- `client/views/aiContentReview.html`: the shared pair-review surface rendered by both the Creator and the Lab; the Creator enables editing and replacement while the Lab renders the same rows read-only.

The Creator and Prompt Lab import the same `runAiContentPipeline` function. There is no separate Discovery Lab or second image-discovery owner.

## Persistence and save

The browser keeps one v4 overwrite-only working record and local WebP assets. Old contract versions are rejected explicitly and are not reinterpreted. Search traces and provider results are not included in learner packages. The final save contract contains only mode, title, reviewed pairs, necessary image filenames, and Wikimedia attribution.

Initial image uploads no longer generate or define pairs. File selection and drag/drop remain only as review-time replacement tools. Save remains blocked until every text prompt and required image is complete.

## Prompt Lab

The Lab always uses the Admin Control Panel model. Every AI stage exposes its system instructions, stage instructions, strict schema, reasoning level, and visible-output token budget. Every executed call records effective model and reasoning, the non-secret request, parsed/provider output, usage, and cost when returned.

The trace also records Wikipedia/Wikimedia request URLs, supplied candidates and IDs, structural extraction, direct/detail route, filename-pattern inference and predicted canonical titles, queued exceptions, file hydration and rejection, acquisition/conversion, and unresolved reasons. Retrying a recorded AI stage reuses only validated upstream AI outputs, verifies that the target input is unchanged, and rebuilds all downstream results. Editing any draft setting supersedes the active revision and clears prior output.

Drafts and up to 30 named checkpoints are browser-local. Checkpoint snapshots can be expanded for comparison and restore author notes and every stage setting. They neither store nor override the configured Admin model.

## Retired implementation

The generated-pair schema, pair-repair prompt, prompt-modality heuristics, topic planner, broad collection traversal, response-title scoring, coherent-family selection, anatomy-specific scoring, separate discovery entry point, initial upload-to-generation route, and separate Wikimedia Discovery Lab were deleted. No forwarding wrappers or compatibility readers remain.

## Verification boundary

Focused contract, prompt, OpenRouter, source-list, direct/detail pipeline, working-store, package, Admin authorization, and interface-baseline tests own the static behavior. Full TypeScript and lint checks are required for changes. `npm run test:ci` requires fresh explicit authorization. An authenticated browser smoke test remains the supported check for live Admin/Creator interaction.
