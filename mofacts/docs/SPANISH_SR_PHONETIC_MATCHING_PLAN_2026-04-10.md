# Spanish SR Phonetic Matching Plan

## Goal

Build a Spanish-specific phonetic matching system for speech recognition fallback so Spanish lessons no longer depend on English-oriented `double-metaphone`.

## Why

- Disabling phonetic fallback for Spanish did not solve the speech-recognition issues well enough.
- The current phonetic layer is designed around English-style phonetic codes and produces unreliable behavior for Spanish answers.
- Spanish orthography is regular enough that a custom language-specific phonetic key system is practical.

## Scope

- Keep the current English phonetic path for non-Spanish languages.
- Add a Spanish-specific phonetic encoder for `es-*` speech-recognition languages.
- Reuse the same Spanish encoder for indexing, conflict filtering, fallback matching, and tie-breaking.
- Do not attempt full IPA or linguistically complete phoneme generation in the first pass.

## Implementation Plan

1. Add a language strategy layer in `client/lib/phoneticUtils.ts`.
   - Route non-Spanish languages to the existing English `double-metaphone` path.
   - Route `es-*` languages to a new Spanish phonetic encoder.

2. Thread the active speech-recognition language into the phonetic utility entry points.
   - Update callers in `client/views/experiment/svelte/services/speechRecognitionService.ts`.
   - Remove the assumption that one phonetic encoding system works for all languages.

3. Implement a Spanish phonetic normalizer that generates matching keys rather than full phonemes.
   - Lowercase and trim.
   - Remove accents and normalize Unicode consistently.
   - Drop silent `h`.
   - Unify `b` and `v`.
   - Unify `ll` and `y`.
   - Normalize `qu` and hard `c/k`.
   - Normalize `j` and soft `g`.
   - Handle `gue/gui` versus `ge/gi`.
   - Decide how to treat `ñ`.
   - Decide how to treat `r` and `rr`.

4. Support alternate Spanish keys where dialect differences matter.
   - Evaluate whether `c/z/s` should collapse fully or support alternate encodings.
   - Evaluate whether `ll/y` should remain fully collapsed.

5. Use the Spanish encoder everywhere the phonetic layer currently participates.
   - `buildPhoneticIndex`
   - `findPhoneticConflictsWithCorrectAnswer`
   - `findPhoneticMatch`
   - `tryPhoneticMatch`

6. Keep the matching structure stable while swapping the encoding system.
   - Exact transcript match first.
   - Language-specific phonetic candidate search second.
   - Edit distance on phonetic keys next.
   - Normalized overlap as the fuzzy tie-break.

7. Build a regression corpus from real Spanish lesson failures.
   - Positive cases such as `estar` versus `star`.
   - Positive cases for likely SR variants of `volver`.
   - Controlled spelling-sound pairs like `vaca/baca`, `llamar/yamar`, `hacer/aser`, and `guitarra/gitarra`.
   - Negative cases such as `volver` versus `otro`.

8. Add automated tests in `client/lib/phoneticUtils.test.ts`.
   - Cover Spanish encoding behavior directly.
   - Cover end-to-end fuzzy matching behavior on Spanish examples.
   - Preserve current English tests to ensure the non-Spanish path stays stable.

9. Add debug logging for Spanish phonetic matching.
   - Log transcript text.
   - Log chosen language strategy.
   - Log generated phonetic key(s).
   - Log the winning candidate and why it won.

10. Re-enable Spanish phonetic fallback only after the Spanish tests pass.

11. Validate with full app typecheck and targeted manual trials in Spanish lessons.

## Non-Goals For First Pass

- Full IPA output.
- Dialect-perfect phonology.
- A generic multilingual phonetic framework for all languages.

## Success Criteria

- Spanish SR no longer depends on English `double-metaphone`.
- Known Spanish false matches are reduced.
- Known Spanish near-miss transcriptions are recovered more reliably.
- English phonetic matching behavior remains intact.
