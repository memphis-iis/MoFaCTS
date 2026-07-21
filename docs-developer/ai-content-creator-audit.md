# AI Content Creator prompt and flow audit

The approved replacement contract and acceptance gates are maintained in the [AI Content Creator simplification and Wikimedia discovery plan](./ai-content-creator-cleanup-plan.md).

**Status:** Blueprint-era flow replaced by the v3 pair contract on 2026-07-20.

## Scope and conclusion

The former creator asked the model to plan intent, a lesson blueprint, targets, quotas, media requirements, and generated items across several prompts. That multiplied representations for the same content, exposed internal planning language to authors, allowed modality drift, and coupled image discovery to model-generated planning fields. Those paths are no longer part of the creator.

The learner AutoTutor and SPARC runtimes remain outside this authoring flow. Creator-specific AutoTutor/SPARC builders were removed instead of retaining parallel authoring contracts.

## Owning contract

`mofacts/common/aiContentContract.ts` now owns one v3 application representation: an ordered array whose entries are exactly `{ kind, stimulus, response }`. The configured OpenAI provider requires an object-root strict schema, so its transport contains only `pairs`; MoFaCTS validates and unwraps that envelope immediately. For image pairs, `stimulus` is private discovery guidance; it cannot become learner-visible text. The final save contract adds only mode, editable title, resolved pair records, and necessary image attribution after generation.

The application deterministically owns lesson instructions, IDs, typed-response settings, lesson structure, filenames, defaults, and packaging. This removes model decisions from stereotyped MoFaCTS structure.

## Active prompts

`mofacts/client/lib/aiContentPrompts.ts` contains the production pair prompt recorded verbatim in the canonical plan. `mofacts/client/lib/aiContentOpenRouterClient.ts` makes one strict pair request and permits at most one failure-specific repair. The repair receives validation errors and must preserve image kinds. There are no separate intent, blueprint, item-batch, distractor, visual-assessment, AutoTutor, or SPARC creator prompts.

## Media discovery

`mofacts/client/lib/aiContentImageSets.ts` performs bounded collection traversal: one cleaned Wikipedia search, collection-link inspection, bounded expansion to member articles, Commons image enumeration, license filtering, evidence-based family grouping, distinct-file assignment, and maximum coherent coverage. It requests 1280px renditions and the browser asset pipeline converts selected images to WebP at quality 0.86. Uncovered pairs remain unresolved image slots and block Save.

## Persistence and save

One overwrite-only browser IndexedDB record owns current work and image bytes. A serialized client queue and in-memory operation sequence prevent stale async writes; neither is revision history. The server retains no creator working record. It supplies authenticated OpenRouter access and accepts only the explicit final save, where it revalidates the v3 contract and package shape.

## Admin diagnostics

Admin Tests contains:

- an AI Content Prompt Lab with the complete editable non-secret request, Run, strict-schema Preflight, raw response, parsed JSON, schema validation, resolved model, credential source, usage, cost, and complete errors;
- a Wikimedia Discovery Lab with a manually triggered strict topic-planning request, five rounds of traversed articles and links, candidate files, family evidence, license decisions, source media types, WebP conversion results, selected 1280px URLs, selection decisions, stop reasons, and rejections. It accepts lab notes only and does not accept Prompt Lab pair output.

Neither lab persists requests or results.

## Verification boundary

Static contract, prompt, deterministic builder, OpenRouter client, Wikimedia fixtures, and server-save checks cover the owning modules. Full typecheck, lint, and diff checks are required. Local Meteor CI still requires fresh explicit authorization. An authenticated browser smoke test is a separate final verification step when requested.
